"""Watchlist matching.

Compiles a watchlist's terms into a matcher supporting keywords, exact phrases,
boolean expressions (``AND``/``OR``/``NOT``, parentheses, quoted phrases),
exclusion terms and per-language term sets.

Word-boundary matching is Unicode-aware (``\\w`` lookarounds, never ``re.ASCII``)
so Hebrew and Arabic terms match on real word boundaries.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from pydantic import BaseModel

from newsradar.connectors.base import QueryTerm

_WS_RE = re.compile(r"\s+")


class MatchResult(BaseModel):
    """Outcome of matching one document against one compiled watchlist."""

    matched: bool
    matched_terms: list[str]
    score: float


def _compile_term_regex(term: str) -> re.Pattern[str]:
    """Compile a Unicode word-boundary regex for a keyword or phrase.

    Uses ``(?<!\\w) ... (?!\\w)`` lookarounds (Unicode ``\\w``) instead of ``\\b``
    with ASCII assumptions, and allows flexible internal whitespace.
    """

    collapsed = _WS_RE.sub(" ", term.strip())
    escaped = re.escape(collapsed).replace(r"\ ", r"\s+")
    return re.compile(rf"(?<!\w){escaped}(?!\w)", re.IGNORECASE | re.UNICODE)


def _term_present(text: str, pattern: re.Pattern[str]) -> bool:
    return pattern.search(text) is not None


# --------------------------------------------------------------------------------------
# Boolean expression parsing
# --------------------------------------------------------------------------------------


@dataclass
class _Leaf:
    text: str
    pattern: re.Pattern[str]


@dataclass
class _Not:
    child: _Node


@dataclass
class _And:
    children: list[_Node]


@dataclass
class _Or:
    children: list[_Node]


_Node = _Leaf | _Not | _And | _Or


def _tokenize(expression: str) -> list[str]:
    tokens: list[str] = []
    i = 0
    n = len(expression)
    while i < n:
        ch = expression[i]
        if ch.isspace():
            i += 1
            continue
        if ch in "()":
            tokens.append(ch)
            i += 1
            continue
        if ch == '"':
            j = expression.find('"', i + 1)
            if j == -1:
                tokens.append(expression[i + 1 :])
                break
            tokens.append(expression[i + 1 : j])
            i = j + 1
            continue
        j = i
        while j < n and not expression[j].isspace() and expression[j] not in '()"':
            j += 1
        tokens.append(expression[i:j])
        i = j
    return tokens


class _Parser:
    """Recursive-descent parser for the watchlist boolean grammar."""

    def __init__(self, tokens: list[str]) -> None:
        self._tokens = tokens
        self._pos = 0

    def parse(self) -> _Node:
        node = self._parse_or()
        if self._pos != len(self._tokens):
            raise ValueError(f"unexpected token: {self._tokens[self._pos]!r}")
        return node

    def _peek(self) -> str | None:
        return self._tokens[self._pos] if self._pos < len(self._tokens) else None

    def _parse_or(self) -> _Node:
        children = [self._parse_and()]
        while self._peek() is not None and self._peek().upper() == "OR":  # type: ignore[union-attr]
            self._pos += 1
            children.append(self._parse_and())
        return children[0] if len(children) == 1 else _Or(children)

    def _parse_and(self) -> _Node:
        children = [self._parse_unary()]
        while True:
            tok = self._peek()
            if tok is None or tok == ")":
                break
            if tok.upper() == "OR":
                break
            if tok.upper() == "AND":
                self._pos += 1
                children.append(self._parse_unary())
                continue
            # Implicit AND (juxtaposition), e.g. "(B OR C) NOT D".
            children.append(self._parse_unary())
        return children[0] if len(children) == 1 else _And(children)

    def _parse_unary(self) -> _Node:
        tok = self._peek()
        if tok is not None and tok.upper() == "NOT":
            self._pos += 1
            return _Not(self._parse_unary())
        return self._parse_atom()

    def _parse_atom(self) -> _Node:
        tok = self._peek()
        if tok is None:
            raise ValueError("unexpected end of expression")
        if tok == "(":
            self._pos += 1
            node = self._parse_or()
            if self._peek() != ")":
                raise ValueError("missing closing parenthesis")
            self._pos += 1
            return node
        if tok == ")":
            raise ValueError("unexpected ')'")
        self._pos += 1
        return _Leaf(text=tok, pattern=_compile_term_regex(tok))


def _parse_boolean(expression: str) -> _Node:
    tokens = _tokenize(expression)
    if not tokens:
        raise ValueError("empty boolean expression")
    return _Parser(tokens).parse()


def _collect_leaves(node: _Node, out: list[_Leaf]) -> None:
    if isinstance(node, _Leaf):
        out.append(node)
    elif isinstance(node, _Not):
        _collect_leaves(node.child, out)
    else:  # _And / _Or
        for child in node.children:
            _collect_leaves(child, out)


def _eval(node: _Node, present: dict[int, bool]) -> bool:
    if isinstance(node, _Leaf):
        return present[id(node)]
    if isinstance(node, _Not):
        return not _eval(node.child, present)
    if isinstance(node, _And):
        return all(_eval(c, present) for c in node.children)
    return any(_eval(c, present) for c in node.children)


# --------------------------------------------------------------------------------------
# Compiled matcher
# --------------------------------------------------------------------------------------


@dataclass
class _SimpleTerm:
    text: str
    lang: str | None
    weight: float
    pattern: re.Pattern[str]


@dataclass
class _BooleanTerm:
    text: str
    lang: str | None
    weight: float
    ast: _Node
    leaves: list[_Leaf] = field(default_factory=list)


class CompiledMatcher:
    """A watchlist compiled into positive/exclusion/boolean matchers."""

    def __init__(
        self,
        simple: list[_SimpleTerm],
        exclusions: list[_SimpleTerm],
        booleans: list[_BooleanTerm],
    ) -> None:
        self._simple = simple
        self._exclusions = exclusions
        self._booleans = booleans

    @staticmethod
    def _applies(term_lang: str | None, doc_lang: str | None) -> bool:
        # A language-scoped term applies only when the document language is unknown
        # or matches; a language-agnostic term always applies.
        if term_lang is None:
            return True
        return doc_lang is None or doc_lang == term_lang

    def match(self, text: str, lang: str | None = None) -> MatchResult:
        """Match ``text`` (with optional detected ``lang``) against the watchlist."""

        # Exclusions veto the whole document.
        for excl in self._exclusions:
            if self._applies(excl.lang, lang) and _term_present(text, excl.pattern):
                return MatchResult(matched=False, matched_terms=[], score=0.0)

        matched_terms: list[str] = []
        matched_weight = 0.0
        total_weight = 0.0

        for term in self._simple:
            if not self._applies(term.lang, lang):
                continue
            total_weight += term.weight
            if _term_present(text, term.pattern):
                matched_terms.append(term.text)
                matched_weight += term.weight

        for bterm in self._booleans:
            if not self._applies(bterm.lang, lang):
                continue
            total_weight += bterm.weight
            present = {id(leaf): _term_present(text, leaf.pattern) for leaf in bterm.leaves}
            if _eval(bterm.ast, present):
                matched_weight += bterm.weight
                for leaf in bterm.leaves:
                    if present[id(leaf)]:
                        matched_terms.append(leaf.text)

        matched = bool(matched_terms) or matched_weight > 0
        score = 0.0
        if total_weight > 0 and matched:
            score = min(1.0, matched_weight / total_weight)

        # De-duplicate matched terms while preserving order.
        seen: set[str] = set()
        unique_terms: list[str] = []
        for term_text in matched_terms:
            if term_text not in seen:
                seen.add(term_text)
                unique_terms.append(term_text)
        return MatchResult(matched=matched, matched_terms=unique_terms, score=score)


def compile_watchlist(terms: Iterable[QueryTerm]) -> CompiledMatcher:
    """Compile watchlist terms into a :class:`CompiledMatcher`."""

    simple: list[_SimpleTerm] = []
    exclusions: list[_SimpleTerm] = []
    booleans: list[_BooleanTerm] = []

    for term in terms:
        text = term.text.strip()
        if not text:
            continue
        if term.is_exclusion:
            exclusions.append(_SimpleTerm(text, term.lang, term.weight, _compile_term_regex(text)))
            continue
        if term.term_type == "boolean":
            ast = _parse_boolean(text)
            leaves: list[_Leaf] = []
            _collect_leaves(ast, leaves)
            booleans.append(_BooleanTerm(text, term.lang, term.weight, ast, leaves))
        else:
            simple.append(_SimpleTerm(text, term.lang, term.weight, _compile_term_regex(text)))

    return CompiledMatcher(simple, exclusions, booleans)


def compile_terms(terms: Sequence[QueryTerm]) -> CompiledMatcher:
    """Alias for :func:`compile_watchlist` (accepts any sequence)."""

    return compile_watchlist(terms)
