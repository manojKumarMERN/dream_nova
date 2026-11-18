import { NovaError, NovaErrorCodes } from '@nova/errors';
import { resolveRuntimeLimits, type RuntimeLimits } from './policy';

export interface ExpressionContext {
  state?: Record<string, unknown>;
  components?: Record<string, unknown>;
  forms?: Record<string, unknown>;
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
  page?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExpressionValidationIssue {
  message: string;
  position: number;
}

type TokenType =
  'number' | 'string' | 'identifier' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export type ExpressionNode =
  | { type: 'literal'; value: unknown }
  | { type: 'identifier'; path: string }
  | { type: 'unary'; operator: string; operand: ExpressionNode }
  | { type: 'binary'; operator: string; left: ExpressionNode; right: ExpressionNode }
  | { type: 'call'; name: string; args: ExpressionNode[] };

const OPERATORS = [
  '==',
  '!=',
  '>=',
  '<=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '>',
  '<',
  '!'
] as const;
const FUNCTIONS: ReadonlySet<string> = new Set([
  'upper',
  'lower',
  'trim',
  'length',
  'default',
  'concat',
  'currency',
  'formatDate'
]);
export const RUNTIME_EXPRESSION_FUNCTIONS: ReadonlySet<string> = FUNCTIONS;
const BLOCKED_SEGMENTS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'eval',
  'function'
]);

function expressionError(message: string, position: number): NovaError {
  return new NovaError(NovaErrorCodes.VALIDATION_FAILED, message, {
    details: { position }
  });
}

function tokenize(input: string, limits: RuntimeLimits): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (char === undefined) {
      break;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'lparen', value: char, position: index });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char, position: index });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char, position: index });
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const start = index;
      const quote = char;
      index += 1;
      let value = '';
      let closed = false;
      while (index < input.length) {
        const current = input[index];
        if (current === undefined) {
          break;
        }
        if (current === quote) {
          closed = true;
          index += 1;
          break;
        }
        if (current === '\\') {
          const escaped = input[index + 1];
          if (escaped === undefined) {
            break;
          }
          value += escaped;
          index += 2;
          continue;
        }
        value += current;
        index += 1;
      }
      if (!closed) {
        throw expressionError('Unterminated string literal', start);
      }
      tokens.push({ type: 'string', value, position: start });
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index;
      let value = '';
      while (index < input.length && /[0-9.]/.test(input[index] ?? '')) {
        value += input[index];
        index += 1;
      }
      if ((value.match(/\./g) ?? []).length > 1) {
        throw expressionError('Invalid numeric literal', start);
      }
      tokens.push({ type: 'number', value, position: start });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      let value = '';
      while (index < input.length && /[A-Za-z0-9_.]/.test(input[index] ?? '')) {
        value += input[index];
        index += 1;
      }
      if (value.endsWith('.') || value.includes('..')) {
        throw expressionError('Invalid identifier path', start);
      }
      for (const segment of value.split('.')) {
        if (BLOCKED_SEGMENTS.has(segment)) {
          throw expressionError(`Blocked identifier segment: ${segment}`, start);
        }
      }
      tokens.push({ type: 'identifier', value, position: start });
      continue;
    }
    const operator = OPERATORS.find((candidate) => input.startsWith(candidate, index));
    if (operator === undefined) {
      throw expressionError(`Unexpected character: ${char}`, index);
    }
    tokens.push({ type: 'operator', value: operator, position: index });
    index += operator.length;
  }

  if (tokens.length > limits.maxExpressionTokens) {
    throw expressionError('Expression has too many tokens', input.length);
  }
  tokens.push({ type: 'eof', value: '', position: input.length });
  return tokens;
}

class Parser {
  private cursor = 0;
  private depth = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly limits: RuntimeLimits,
    private readonly allowedFunctions: ReadonlySet<string>
  ) {}

  private enter(): () => void {
    this.depth += 1;
    if (this.depth > this.limits.maxExpressionDepth) {
      this.depth -= 1;
      throw expressionError('Expression is nested too deeply', this.current().position);
    }
    return () => {
      this.depth -= 1;
    };
  }

  parse(): ExpressionNode {
    const node = this.parseOr();
    const token = this.current();
    if (token.type !== 'eof') {
      throw expressionError(`Unexpected token: ${token.value}`, token.position);
    }
    return node;
  }

  private current(): Token {
    return this.tokens[this.cursor] ?? { type: 'eof', value: '', position: 0 };
  }

  private consume(type: TokenType, value?: string): Token {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw expressionError(`Expected ${value ?? type}`, token.position);
    }
    this.cursor += 1;
    return token;
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.current();
    return token.type === type && (value === undefined || token.value === value);
  }

  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.match('operator', '||')) {
      const operator = this.consume('operator').value;
      left = { type: 'binary', operator, left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ExpressionNode {
    let left = this.parseEquality();
    while (this.match('operator', '&&')) {
      const operator = this.consume('operator').value;
      left = { type: 'binary', operator, left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): ExpressionNode {
    let left = this.parseComparison();
    while (this.match('operator', '==') || this.match('operator', '!=')) {
      const operator = this.consume('operator').value;
      left = { type: 'binary', operator, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive();
    while (
      this.match('operator', '>') ||
      this.match('operator', '>=') ||
      this.match('operator', '<') ||
      this.match('operator', '<=')
    ) {
      const operator = this.consume('operator').value;
      left = { type: 'binary', operator, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    while (this.match('operator', '+') || this.match('operator', '-')) {
      const operator = this.consume('operator').value;
      left = { type: 'binary', operator, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    while (
      this.match('operator', '*') ||
      this.match('operator', '/') ||
      this.match('operator', '%')
    ) {
      const operator = this.consume('operator').value;
      left = { type: 'binary', operator, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ExpressionNode {
    if (this.match('operator', '!') || this.match('operator', '-')) {
      const operator = this.consume('operator').value;
      const exit = this.enter();
      try {
        return { type: 'unary', operator, operand: this.parseUnary() };
      } finally {
        exit();
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.current();
    if (token.type === 'number') {
      this.consume('number');
      return { type: 'literal', value: Number(token.value) };
    }
    if (token.type === 'string') {
      this.consume('string');
      return { type: 'literal', value: token.value };
    }
    if (token.type === 'identifier') {
      this.consume('identifier');
      if (this.match('lparen')) {
        if (!FUNCTIONS.has(token.value) || !this.allowedFunctions.has(token.value)) {
          throw expressionError(`Unsupported function: ${token.value}`, token.position);
        }
        const exit = this.enter();
        try {
          this.consume('lparen');
          const args: ExpressionNode[] = [];
          if (!this.match('rparen')) {
            args.push(this.parseOr());
            while (this.match('comma')) {
              this.consume('comma');
              args.push(this.parseOr());
            }
          }
          this.consume('rparen');
          return { type: 'call', name: token.value, args };
        } finally {
          exit();
        }
      }
      return { type: 'identifier', path: token.value };
    }
    if (this.match('lparen')) {
      const exit = this.enter();
      try {
        this.consume('lparen');
        const node = this.parseOr();
        this.consume('rparen');
        return node;
      } finally {
        exit();
      }
    }
    throw expressionError(
      `Unexpected token: ${token.value || 'end of expression'}`,
      token.position
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (!isRecord(current) || BLOCKED_SEGMENTS.has(segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function resolveIdentifier(path: string, context: ExpressionContext): unknown {
  const [root, ...rest] = path.split('.');
  if (root === undefined) {
    return undefined;
  }
  const rootValue = Object.prototype.hasOwnProperty.call(context, root) ? context[root] : undefined;
  return rest.length === 0 ? rootValue : readPath(rootValue, rest.join('.'));
}

function callFunction(name: string, args: readonly unknown[]): unknown {
  const first = args[0];
  switch (name) {
    case 'upper':
      return String(first ?? '').toUpperCase();
    case 'lower':
      return String(first ?? '').toLowerCase();
    case 'trim':
      return String(first ?? '').trim();
    case 'length':
      if (Array.isArray(first) || typeof first === 'string') {
        return first.length;
      }
      return 0;
    case 'default':
      return first === undefined || first === null || first === '' ? (args[1] ?? null) : first;
    case 'concat':
      return args.map((value) => String(value ?? '')).join('');
    case 'currency': {
      const amount = Number(first);
      return Number.isFinite(amount)
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
        : '';
    }
    case 'formatDate': {
      const source = first instanceof Date ? first : new Date(String(first ?? ''));
      return Number.isNaN(source.getTime()) ? '' : new Intl.DateTimeFormat('en-US').format(source);
    }
    default:
      throw expressionError(`Unsupported function: ${name}`, 0);
  }
}

interface EvaluationBudget {
  steps: number;
  limits: RuntimeLimits;
}

function consumeStep(budget: EvaluationBudget): void {
  budget.steps += 1;
  if (budget.steps > budget.limits.maxEvalSteps) {
    throw expressionError('Expression evaluation quota exceeded', 0);
  }
}

function evaluateNode(
  node: ExpressionNode,
  context: ExpressionContext,
  budget: EvaluationBudget
): unknown {
  consumeStep(budget);
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'identifier':
      return resolveIdentifier(node.path, context);
    case 'unary': {
      const value = evaluateNode(node.operand, context, budget);
      return node.operator === '!' ? !value : -Number(value);
    }
    case 'call':
      return callFunction(
        node.name,
        node.args.map((argument) => evaluateNode(argument, context, budget))
      );
    case 'binary': {
      if (node.operator === '&&') {
        return (
          evaluateNode(node.left, context, budget) && evaluateNode(node.right, context, budget)
        );
      }
      if (node.operator === '||') {
        return (
          evaluateNode(node.left, context, budget) || evaluateNode(node.right, context, budget)
        );
      }
      const left = evaluateNode(node.left, context, budget);
      const right = evaluateNode(node.right, context, budget);
      switch (node.operator) {
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '>':
          return Number(left) > Number(right);
        case '>=':
          return Number(left) >= Number(right);
        case '<':
          return Number(left) < Number(right);
        case '<=':
          return Number(left) <= Number(right);
        case '+':
          return typeof left === 'string' || typeof right === 'string'
            ? `${String(left ?? '')}${String(right ?? '')}`
            : Number(left) + Number(right);
        case '-':
          return Number(left) - Number(right);
        case '*':
          return Number(left) * Number(right);
        case '/':
          return Number(right) === 0 ? 0 : Number(left) / Number(right);
        case '%':
          return Number(right) === 0 ? 0 : Number(left) % Number(right);
        default:
          throw expressionError(`Unsupported operator: ${node.operator}`, 0);
      }
    }
  }
}

export function parseExpression(
  input: string,
  limits: RuntimeLimits = resolveRuntimeLimits(),
  allowedFunctions: ReadonlySet<string> = FUNCTIONS
): ExpressionNode {
  if (input.length > limits.maxExpressionLength) {
    throw expressionError('Expression is too long', 0);
  }
  return new Parser(tokenize(input, limits), limits, allowedFunctions).parse();
}

export function validateExpression(
  input: string,
  limits: RuntimeLimits = resolveRuntimeLimits(),
  allowedFunctions: ReadonlySet<string> = FUNCTIONS
): ExpressionValidationIssue[] {
  try {
    parseExpression(input, limits, allowedFunctions);
    return [];
  } catch (error) {
    const details =
      error instanceof NovaError && isRecord(error.details) ? error.details : undefined;
    const position = typeof details?.position === 'number' ? details.position : 0;
    return [{ message: error instanceof Error ? error.message : 'Invalid expression', position }];
  }
}

export function evaluateExpression(
  expression: string,
  context: ExpressionContext = {},
  limits: RuntimeLimits = resolveRuntimeLimits(),
  allowedFunctions: ReadonlySet<string> = FUNCTIONS
): unknown {
  return evaluateNode(parseExpression(expression, limits, allowedFunctions), context, {
    steps: 0,
    limits
  });
}

function interpolateString(
  value: string,
  context: ExpressionContext,
  limits: RuntimeLimits,
  allowedFunctions: ReadonlySet<string>
): unknown {
  const whole = /^\s*\{\{([\s\S]+)\}\}\s*$/.exec(value);
  if (whole?.[1] !== undefined) {
    return evaluateExpression(whole[1], context, limits, allowedFunctions);
  }
  const result = value.replace(/\{\{([\s\S]+?)\}\}/g, (_match, expression: string) => {
    const evaluated = evaluateExpression(expression, context, limits, allowedFunctions);
    return evaluated === undefined || evaluated === null ? '' : String(evaluated);
  });
  if (result.length > limits.maxInterpolatedLength) {
    throw expressionError('Interpolated value is too long', value.length);
  }
  return result;
}

export function interpolateExpressions(
  value: unknown,
  context: ExpressionContext,
  limits: RuntimeLimits = resolveRuntimeLimits(),
  allowedFunctions: ReadonlySet<string> = FUNCTIONS,
  depth = 0
): unknown {
  if (depth > limits.maxInterpolationDepth) {
    throw expressionError('Interpolation is nested too deeply', 0);
  }
  if (typeof value === 'string') {
    if (value.length > limits.maxInterpolatedLength) {
      throw expressionError('Interpolated value is too long', 0);
    }
    return interpolateString(value, context, limits, allowedFunctions);
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      interpolateExpressions(item, context, limits, allowedFunctions, depth + 1)
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        interpolateExpressions(item, context, limits, allowedFunctions, depth + 1)
      ])
    );
  }
  return value;
}
