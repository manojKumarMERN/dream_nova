import {
  Children,
  Fragment,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
  type ReactNode
} from 'react';
import type { RuntimeNode } from '@nova/runtime-core';
import {
  emptyRuntimeRenderContext,
  type RenderNodeOptions,
  type RuntimeEventHandler,
  type RuntimeRenderer,
  type RuntimeRendererProps
} from './types';

const STYLE_KEYS = [
  'alignItems',
  'alignSelf',
  'backgroundColor',
  'border',
  'borderColor',
  'borderRadius',
  'bottom',
  'boxShadow',
  'color',
  'display',
  'flex',
  'flexDirection',
  'flexWrap',
  'fontSize',
  'fontWeight',
  'gap',
  'gridAutoFlow',
  'gridTemplateColumns',
  'gridTemplateRows',
  'height',
  'justifyContent',
  'left',
  'margin',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'objectFit',
  'opacity',
  'overflow',
  'padding',
  'position',
  'right',
  'textAlign',
  'textDecoration',
  'textOverflow',
  'top',
  'whiteSpace',
  'width'
] as const;

const ALIGN_KEYS = new Set<string>(['alignItems', 'justifyContent']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(node: RuntimeNode, keys: readonly string[], fallback = ''): string {
  for (const key of keys) {
    const value = node.props[key];
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }
  return fallback;
}

function text(node: RuntimeNode, key: string, fallback = ''): string {
  return readText(node, [key], fallback);
}

function bool(node: RuntimeNode, key: string, fallback = false): boolean {
  const value = node.props[key];
  return typeof value === 'boolean' ? value : fallback;
}

function fieldError(node: RuntimeNode): string | undefined {
  const error = node.props.error;
  return typeof error === 'string' && error.length > 0 ? error : undefined;
}

function numberValue(node: RuntimeNode, key: string, fallback: number): number {
  const value = node.props[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function alignValue(value: unknown): unknown {
  if (value === 'start') {
    return 'flex-start';
  }
  if (value === 'end') {
    return 'flex-end';
  }
  if (value === 'between') {
    return 'space-between';
  }
  return value;
}

function nodeStyle(node: RuntimeNode): CSSProperties | undefined {
  const source = node.props.style;
  const style: Record<string, unknown> = isRecord(source) ? { ...source } : {};
  const put = (key: string, value: unknown) => {
    if (value !== undefined && style[key] === undefined) {
      style[key] = ALIGN_KEYS.has(key) ? alignValue(value) : value;
    }
  };

  for (const key of STYLE_KEYS) {
    put(key, node.props[key]);
  }

  const direction = text(node, 'direction');
  if (direction === 'row' || direction === 'column') {
    put('flexDirection', direction);
  }
  const align = text(node, 'align');
  if (align === 'left' || align === 'center' || align === 'right') {
    put('textAlign', align);
  }
  const fit = text(node, 'fit');
  if (fit === 'cover' || fit === 'contain' || fit === 'fill') {
    put('objectFit', fit);
  }
  if (typeof node.props.columns === 'number') {
    put('gridTemplateColumns', `repeat(${String(node.props.columns)}, minmax(0, 1fr))`);
  }
  if (typeof node.props.rows === 'number') {
    put('gridTemplateRows', `repeat(${String(node.props.rows)}, minmax(0, 1fr))`);
  }
  if (node.props.autoFlow === 'row' || node.props.autoFlow === 'column') {
    put('gridAutoFlow', node.props.autoFlow);
  }
  if (typeof node.props.wrap === 'boolean') {
    put('flexWrap', node.props.wrap ? 'wrap' : 'nowrap');
  }
  if (node.props.reverse === true) {
    const base =
      typeof style.flexDirection === 'string' ? style.flexDirection : direction || 'column';
    const reverse = base.endsWith('-reverse') ? base : `${base}-reverse`;
    style.flexDirection = reverse;
  }

  return Object.keys(style).length === 0 ? undefined : (style as CSSProperties);
}

interface ShellProps {
  'data-nova-id': string;
  'data-renderer': string;
  'data-variant': string | undefined;
  className: string;
  style: CSSProperties | undefined;
}

function shellProps(
  node: RuntimeNode,
  name: string,
  extraStyle: CSSProperties | undefined = undefined
): ShellProps {
  const variant = text(node, 'variant');
  const custom = text(node, 'className')
    .split(/\s+/)
    .filter((value) => value.length > 0);
  const classes = [`nova-${name}`];
  if (variant.length > 0) {
    classes.push(`nova-${name}--${variant}`);
  }
  classes.push(...custom);
  if (bool(node, 'truncate')) {
    classes.push('nova-truncate');
  }
  if (bool(node, 'underline')) {
    classes.push('nova-underline');
  }
  if (bool(node, 'disabled')) {
    classes.push('nova-disabled');
  }
  const style = nodeStyle(node);
  return {
    'data-nova-id': node.id,
    'data-renderer': node.renderer,
    'data-variant': variant.length > 0 ? variant : undefined,
    className: classes.join(' '),
    style: extraStyle === undefined ? style : { ...(style ?? {}), ...extraStyle }
  };
}

function emit(
  node: RuntimeNode,
  onEvent: RuntimeEventHandler | undefined,
  event: string,
  payload: unknown
): void {
  onEvent?.({ nodeId: node.id, event, payload });
}

interface SelectOption {
  label: string;
  value: string;
  href: string;
}

function selectOptions(value: unknown): SelectOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      const optionValue = String(item);
      return { label: optionValue, value: optionValue, href: optionValue };
    }
    if (isRecord(item)) {
      const optionValue = item.value ?? item.key ?? item.href ?? item.label ?? '';
      return {
        label: String(item.label ?? item.text ?? item.name ?? optionValue),
        value: String(optionValue),
        href: String(item.href ?? optionValue)
      };
    }
    return { label: '', value: '', href: '' };
  });
}

function dataRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function chartPoints(value: unknown): Array<{ label: string; value: number }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    if (isRecord(item)) {
      const label = String(item.label ?? item.name ?? item.x ?? '');
      const numeric = Number(item.value ?? item.y ?? 0);
      return { label, value: Number.isFinite(numeric) ? numeric : 0 };
    }
    return { label: String(item), value: 0 };
  });
}

function inputRenderer(className: string, type: string): RuntimeRenderer {
  return ({ node, onEvent }) => {
    const error = fieldError(node);
    const name = text(node, 'name');
    return (
      <label {...shellProps(node, className)}>
        {text(node, 'label') === '' ? null : (
          <span className="nova-input-label">{text(node, 'label')}</span>
        )}
        <input
          type={type}
          name={name === '' ? undefined : name}
          placeholder={text(node, 'placeholder')}
          required={bool(node, 'required')}
          disabled={bool(node, 'disabled')}
          value={text(node, 'value')}
          aria-invalid={error === undefined ? undefined : true}
          min={type === 'number' ? numberValue(node, 'min', Number.NaN) : undefined}
          max={type === 'number' ? numberValue(node, 'max', Number.NaN) : undefined}
          step={type === 'number' ? numberValue(node, 'step', Number.NaN) : undefined}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            emit(node, onEvent, 'change', { value: event.currentTarget.value })
          }
        />
        {error === undefined ? null : <span className="nova-field-error">{error}</span>}
      </label>
    );
  };
}

export const StackRenderer: RuntimeRenderer = ({ node, children }) => (
  <div {...shellProps(node, 'stack')}>{children}</div>
);

export const TextRenderer: RuntimeRenderer = ({ node, children }) => (
  <span {...shellProps(node, 'text')}>
    {children}
    {readText(node, ['content', 'text', 'label'])}
  </span>
);

export const ButtonRenderer: RuntimeRenderer = ({ node, onEvent, children }) => (
  <button
    {...shellProps(node, 'button')}
    type={
      text(node, 'type', 'button') === 'submit'
        ? 'submit'
        : text(node, 'type') === 'reset'
          ? 'reset'
          : 'button'
    }
    disabled={bool(node, 'disabled') || bool(node, 'loading')}
    onClick={() => emit(node, onEvent, 'click', {})}
  >
    {children}
    {readText(node, ['label', 'text', 'content'], 'Button')}
  </button>
);

export const TextInputRenderer = inputRenderer('text-input', 'text');

export const ContainerRenderer: RuntimeRenderer = ({ node, children }) => (
  <div {...shellProps(node, 'container')}>
    {text(node, 'label') === '' ? null : (
      <strong className="nova-container-label">{text(node, 'label')}</strong>
    )}
    {children}
  </div>
);

export const RowRenderer: RuntimeRenderer = ({ node, children }) => (
  <div {...shellProps(node, 'row')}>{children}</div>
);

export const ColumnRenderer: RuntimeRenderer = ({ node, children }) => (
  <div {...shellProps(node, 'column')}>{children}</div>
);

export const GridRenderer: RuntimeRenderer = ({ node, children }) => (
  <div {...shellProps(node, 'grid')}>{children}</div>
);

export const SectionRenderer: RuntimeRenderer = ({ node, children }) => (
  <section {...shellProps(node, 'section')}>
    {text(node, 'title') === '' ? null : (
      <h3 className="nova-section-title">{text(node, 'title')}</h3>
    )}
    {text(node, 'subtitle') === '' ? null : (
      <p className="nova-section-subtitle">{text(node, 'subtitle')}</p>
    )}
    {children}
  </section>
);

export const TabsRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  const items = selectOptions(node.props.items ?? node.props.tabs);
  const active = text(node, 'activeValue');
  const orientation = text(node, 'orientation', 'horizontal');
  const shell = shellProps(node, 'tabs');
  return (
    <div
      {...shell}
      className={`${shell.className}${orientation === 'vertical' ? ' nova-tabs-vertical' : ''}`}
      data-orientation={orientation}
    >
      <div className="nova-tabs-header" role="tablist">
        {items.map((item, index) => (
          <button
            type="button"
            role="tab"
            key={item.value || String(index)}
            aria-selected={item.value === active}
            onClick={() => emit(node, onEvent, 'change', { value: item.value, index })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="nova-tabs-body">{children}</div>
    </div>
  );
};

export const HeadingRenderer: RuntimeRenderer = ({ node, children }) => {
  const level = text(node, 'level', 'h2');
  const HeadingTag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(level) ? level : 'h2') as
    'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <HeadingTag {...shellProps(node, 'heading')}>
      {children}
      {readText(node, ['content', 'text', 'label'])}
    </HeadingTag>
  );
};

export const ImageRenderer: RuntimeRenderer = ({ node }) => (
  <img
    {...shellProps(node, 'image')}
    src={text(node, 'src')}
    alt={text(node, 'alt')}
    loading={bool(node, 'lazy', true) ? 'lazy' : 'eager'}
  />
);

export const IconRenderer: RuntimeRenderer = ({ node }) => (
  <span {...shellProps(node, 'icon')} aria-hidden="true">
    {readText(node, ['name', 'content', 'label'])}
  </span>
);

export const DividerRenderer: RuntimeRenderer = ({ node }) => (
  <hr {...shellProps(node, 'divider')} />
);

export const CardRenderer: RuntimeRenderer = ({ node, children }) => (
  <div {...shellProps(node, 'card')}>{children}</div>
);

export const BadgeRenderer: RuntimeRenderer = ({ node, children }) => (
  <span {...shellProps(node, 'badge')}>
    {children}
    {readText(node, ['text', 'label', 'content'])}
  </span>
);

export const TextareaRenderer: RuntimeRenderer = ({ node, onEvent }) => {
  const error = fieldError(node);
  const name = text(node, 'name');
  return (
    <label {...shellProps(node, 'textarea')}>
      {text(node, 'label') === '' ? null : (
        <span className="nova-input-label">{text(node, 'label')}</span>
      )}
      <textarea
        name={name === '' ? undefined : name}
        placeholder={text(node, 'placeholder')}
        required={bool(node, 'required')}
        disabled={bool(node, 'disabled')}
        value={text(node, 'value')}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          emit(node, onEvent, 'change', { value: event.currentTarget.value })
        }
      />
      {error === undefined ? null : <span className="nova-field-error">{error}</span>}
    </label>
  );
};

export const NumberInputRenderer = inputRenderer('number-input', 'number');
export const EmailInputRenderer = inputRenderer('email-input', 'email');
export const PasswordInputRenderer = inputRenderer('password-input', 'password');

export const SelectRenderer: RuntimeRenderer = ({ node, onEvent }) => {
  const multiple = bool(node, 'multiple');
  const rawValue = node.props.value;
  const value = multiple
    ? Array.isArray(rawValue)
      ? rawValue.map((item) => String(item))
      : rawValue === undefined
        ? []
        : [String(rawValue)]
    : text(node, 'value');
  const placeholder = text(node, 'placeholder');
  const error = fieldError(node);
  const name = text(node, 'name');
  return (
    <label {...shellProps(node, 'select')}>
      {text(node, 'label') === '' ? null : (
        <span className="nova-input-label">{text(node, 'label')}</span>
      )}
      <select
        name={name === '' ? undefined : name}
        multiple={multiple}
        disabled={bool(node, 'disabled')}
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          emit(node, onEvent, 'change', {
            value: multiple
              ? Array.from(event.currentTarget.selectedOptions, (option) => option.value)
              : event.currentTarget.value
          })
        }
      >
        {!multiple && placeholder === '' ? null : (
          <option value="" disabled={!multiple}>
            {placeholder || 'Select…'}
          </option>
        )}
        {selectOptions(node.props.options).map((option, index) => (
          <option key={option.value || String(index)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error === undefined ? null : <span className="nova-field-error">{error}</span>}
    </label>
  );
};

export const CheckboxRenderer: RuntimeRenderer = ({ node, onEvent }) => {
  const name = text(node, 'name');
  return (
    <label {...shellProps(node, 'checkbox')}>
      <input
        type="checkbox"
        name={name === '' ? undefined : name}
        required={bool(node, 'required')}
        disabled={bool(node, 'disabled')}
        checked={bool(node, 'checked')}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          emit(node, onEvent, 'change', { checked: event.currentTarget.checked })
        }
      />
      <span>
        {readText(node, ['label', 'text'])}
        {text(node, 'description') === '' ? null : (
          <small className="nova-checkbox-description">{text(node, 'description')}</small>
        )}
      </span>
    </label>
  );
};

export const RadioGroupRenderer: RuntimeRenderer = ({ node, onEvent }) => (
  <fieldset {...shellProps(node, 'radio-group')}>
    <legend>{text(node, 'label')}</legend>
    {selectOptions(node.props.options).map((option, index) => (
      <label key={option.value || String(index)}>
        <input
          type="radio"
          name={text(node, 'name', node.id)}
          value={option.value}
          checked={option.value === text(node, 'value')}
          onChange={() => emit(node, onEvent, 'change', { value: option.value })}
        />
        {option.label}
      </label>
    ))}
  </fieldset>
);

export const DatePickerRenderer = inputRenderer('date-picker', 'date');

export const FileUploadRenderer: RuntimeRenderer = ({ node, onEvent }) => (
  <label {...shellProps(node, 'file-upload')}>
    {text(node, 'label') === '' ? null : (
      <span className="nova-input-label">{text(node, 'label')}</span>
    )}
    <input
      type="file"
      multiple={bool(node, 'multiple')}
      required={bool(node, 'required')}
      accept={text(node, 'accept', '*/*')}
      data-max-size-mb={String(numberValue(node, 'maxSizeMb', 10))}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        emit(node, onEvent, 'change', { files: Array.from(event.currentTarget.files ?? []) })
      }
    />
  </label>
);

export const FormRenderer: RuntimeRenderer = ({ node, onEvent, children, runtime }) => {
  const form = runtime?.forms[node.id];
  const loading = form?.loading ?? bool(node, 'loading');
  return (
    <form
      {...shellProps(node, 'form')}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const values: Record<string, unknown> = {};
        const fields = event.currentTarget.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input[name],select[name],textarea[name]');
        for (const field of fields) {
          values[field.name] =
            field instanceof HTMLInputElement && field.type === 'checkbox'
              ? field.checked
              : field.value;
        }
        emit(node, onEvent, 'submit', { values });
      }}
    >
      {children}
      {form?.formErrors.map((message, index) => (
        <div key={`${String(index)}-${message}`} className="nova-form-error" role="alert">
          {message}
        </div>
      ))}
      {form?.failure === undefined ? null : (
        <div className="nova-form-failure" role="alert">
          {form.failure}
        </div>
      )}
      {form?.success === undefined ? null : (
        <div className="nova-form-success" role="status">
          {form.success}
        </div>
      )}
      <button type="submit" disabled={loading}>
        {loading ? text(node, 'loadingLabel', 'Working…') : text(node, 'submitLabel', 'Submit')}
      </button>
    </form>
  );
};

export const LinkRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  const external = bool(node, 'external');
  const target = text(node, 'target', external ? '_blank' : '_self');
  return (
    <a
      {...shellProps(node, 'link')}
      href={text(node, 'href', '#')}
      target={target}
      {...(external ? { rel: 'noopener noreferrer' } : {})}
      onClick={() => emit(node, onEvent, 'navigate', { href: text(node, 'href', '#') })}
    >
      {children}
      {text(node, 'label')}
    </a>
  );
};

export const DropdownRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  const open = bool(node, 'open');
  return (
    <div
      {...shellProps(node, 'dropdown', open ? {} : undefined)}
      data-open={open ? 'true' : 'false'}
    >
      <button type="button" onClick={() => emit(node, onEvent, 'toggle', {})}>
        {text(node, 'label', 'Menu')}
      </button>
      {open ? (
        <div className="nova-dropdown-panel">
          {selectOptions(node.props.items).map((item, index) => (
            <button
              type="button"
              key={item.value || String(index)}
              onClick={() => emit(node, onEvent, 'select', { value: item.value })}
            >
              {item.label}
            </button>
          ))}
          {children}
        </div>
      ) : null}
    </div>
  );
};

export const MenuRenderer: RuntimeRenderer = ({ node, onEvent, children }) => (
  <nav
    {...shellProps(node, 'menu', {
      flexDirection: text(node, 'orientation') === 'vertical' ? 'column' : 'row'
    })}
  >
    <ul>
      {selectOptions(node.props.items ?? node.props.links).map((item, index) => (
        <li key={item.value || String(index)}>
          <a href={item.href} onClick={() => emit(node, onEvent, 'navigate', { href: item.href })}>
            {item.label}
          </a>
        </li>
      ))}
      {children}
    </ul>
  </nav>
);

export const DataTableRenderer: RuntimeRenderer = ({ node, onEvent }) => {
  const columns = selectOptions(node.props.columns);
  const rows = dataRows(node.props.rows).slice(0, numberValue(node, 'pageSize', 20));
  const sortable = bool(node, 'sortable', true);
  return (
    <table {...shellProps(node, 'data-table')}>
      {text(node, 'title') === '' ? null : (
        <caption className="nova-data-title">{text(node, 'title')}</caption>
      )}
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th
              key={column.value || String(index)}
              {...(sortable
                ? {
                    onClick: () =>
                      emit(node, onEvent, 'sort', {
                        key: column.value,
                        direction: 'asc'
                      })
                  }
                : {})}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={String(index)} onClick={() => emit(node, onEvent, 'rowClick', { row })}>
            {columns.map((column, columnIndex) => (
              <td key={column.value || String(columnIndex)}>{String(row[column.value] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const ListRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  const items = selectOptions(node.props.items ?? node.props.links);
  const ListTag = bool(node, 'ordered') ? 'ol' : 'ul';
  return (
    <ListTag {...shellProps(node, 'list')}>
      {items.map((item, index) => (
        <li key={item.value || String(index)}>
          <a href={item.href} onClick={() => emit(node, onEvent, 'itemClick', { index })}>
            {item.label}
          </a>
        </li>
      ))}
      {items.length === 0 && Children.count(children) === 0 ? (
        <li className="nova-list-empty">{text(node, 'emptyText', 'No items')}</li>
      ) : (
        children
      )}
    </ListTag>
  );
};

export const ChartRenderer: RuntimeRenderer = ({ node, onEvent }) => {
  const points = chartPoints(node.props.data);
  return (
    <div {...shellProps(node, 'chart')} role="img" aria-label={text(node, 'title', 'Chart')}>
      {text(node, 'title') === '' ? null : (
        <strong className="nova-chart-title">{text(node, 'title')}</strong>
      )}
      <ul className="nova-chart-points">
        {points.map((point, index) => (
          <li key={`${point.label}-${String(index)}`}>
            <button
              type="button"
              onClick={() =>
                emit(node, onEvent, 'pointClick', {
                  label: point.label,
                  value: point.value
                })
              }
            >
              {point.label}: {point.value}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const StatisticsCardRenderer: RuntimeRenderer = ({ node, onEvent }) => (
  <button
    {...shellProps(node, 'statistics-card')}
    type="button"
    onClick={() => emit(node, onEvent, 'click', {})}
  >
    <span className="nova-statistics-label">{text(node, 'label')}</span>
    <strong>{text(node, 'value')}</strong>
    {text(node, 'delta') === '' ? null : (
      <span className="nova-statistics-delta">{text(node, 'delta')}</span>
    )}
  </button>
);

export const DataGridRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  const columns = selectOptions(node.props.columns);
  const rows = dataRows(node.props.rows).slice(0, numberValue(node, 'pageSize', 25));
  const editable = bool(node, 'editable');
  return (
    <div {...shellProps(node, 'data-grid')} role="grid">
      {text(node, 'title') === '' ? null : (
        <strong className="nova-data-title">{text(node, 'title')}</strong>
      )}
      <table>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={column.value || String(index)}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={String(rowIndex)}>
              {columns.map((column, columnIndex) => (
                <td key={column.value || String(columnIndex)}>
                  {editable ? (
                    <input
                      defaultValue={String(row[column.value] ?? '')}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        emit(node, onEvent, 'cellChange', {
                          rowIndex,
                          key: column.value,
                          value: event.currentTarget.value
                        })
                      }
                    />
                  ) : (
                    String(row[column.value] ?? '')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {children}
    </div>
  );
};

export const NavbarRenderer: RuntimeRenderer = ({ node, onEvent, children }) => (
  <nav {...shellProps(node, 'navbar')}>
    <strong className="nova-navbar-brand">{text(node, 'brand', 'NOVA')}</strong>
    <div className="nova-navbar-links">
      {selectOptions(node.props.links).map((link, index) => (
        <a
          key={link.value || String(index)}
          href={link.href}
          onClick={() => emit(node, onEvent, 'navigate', { href: link.href })}
        >
          {link.label}
        </a>
      ))}
    </div>
    {children}
  </nav>
);

export const SidebarRenderer: RuntimeRenderer = ({ node, onEvent, children }) => (
  <aside
    {...shellProps(node, 'sidebar', { width: `${String(numberValue(node, 'width', 240))}px` })}
  >
    {text(node, 'title') === '' ? null : (
      <strong className="nova-sidebar-title">{text(node, 'title')}</strong>
    )}
    <ul>
      {selectOptions(node.props.items).map((item, index) => (
        <li key={item.value || String(index)}>
          <a href={item.href} onClick={() => emit(node, onEvent, 'navigate', { href: item.href })}>
            {item.label}
          </a>
        </li>
      ))}
    </ul>
    {children}
  </aside>
);

export const BreadcrumbRenderer: RuntimeRenderer = ({ node, onEvent }) => {
  const maxItems = numberValue(node, 'maxItems', 8);
  const items = selectOptions(node.props.items).slice(0, maxItems);
  return (
    <nav {...shellProps(node, 'breadcrumb')} aria-label="Breadcrumb">
      {items.map((item, index) => (
        <Fragment key={item.value || String(index)}>
          {index > 0 ? (
            <span className="nova-breadcrumb-separator">{text(node, 'separator', '/')}</span>
          ) : null}
          <button
            type="button"
            onClick={() => emit(node, onEvent, 'navigate', { href: item.href })}
          >
            {item.label}
          </button>
        </Fragment>
      ))}
    </nav>
  );
};

export const PaginationRenderer: RuntimeRenderer = ({ node, onEvent }) => {
  const page = Math.max(1, numberValue(node, 'page', 1));
  const pageSize = Math.max(1, numberValue(node, 'pageSize', 20));
  const total = numberValue(node, 'total', 0);
  const count = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav {...shellProps(node, 'pagination')} aria-label="Pagination">
      {bool(node, 'showSummary', true) ? (
        <span className="nova-pagination-summary">
          Page {String(page)} of {String(count)}
        </span>
      ) : null}
      {Array.from({ length: count }, (_, index) => index + 1).map((value) => (
        <button
          type="button"
          key={String(value)}
          className={value === page ? 'active' : ''}
          aria-current={value === page ? 'page' : undefined}
          onClick={() => emit(node, onEvent, 'change', { page: value })}
        >
          {String(value)}
        </button>
      ))}
    </nav>
  );
};

export const ModalRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  if (!bool(node, 'open')) {
    return null;
  }
  return (
    <div {...shellProps(node, 'modal')} role="dialog" aria-modal="true">
      <div className="nova-modal-content">
        <div className="nova-modal-header">
          <h2>{text(node, 'title', 'Modal')}</h2>
          {bool(node, 'closable', true) ? (
            <button type="button" onClick={() => emit(node, onEvent, 'close', {})}>
              {text(node, 'closeLabel', 'Close')}
            </button>
          ) : null}
        </div>
        {text(node, 'message') === '' ? null : <p>{text(node, 'message')}</p>}
        {children}
      </div>
    </div>
  );
};

export const DialogRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  if (!bool(node, 'open')) {
    return null;
  }
  return (
    <div {...shellProps(node, 'dialog')} role="dialog" aria-modal="true">
      <h2>{text(node, 'title', 'Dialog')}</h2>
      {text(node, 'message') === '' ? null : <p>{text(node, 'message')}</p>}
      {children}
      <div className="nova-dialog-actions">
        <button type="button" onClick={() => emit(node, onEvent, 'cancel', {})}>
          {text(node, 'cancelLabel', 'Cancel')}
        </button>
        <button type="button" onClick={() => emit(node, onEvent, 'confirm', {})}>
          {text(node, 'confirmLabel', 'Confirm')}
        </button>
      </div>
    </div>
  );
};

export const DrawerRenderer: RuntimeRenderer = ({ node, onEvent, children }) => {
  if (!bool(node, 'open')) {
    return null;
  }
  return (
    <aside {...shellProps(node, 'drawer')} role="dialog">
      <div className="nova-drawer-header">
        <h2>{text(node, 'title', 'Drawer')}</h2>
        <button type="button" onClick={() => emit(node, onEvent, 'close', {})}>
          {text(node, 'closeLabel', 'Close')}
        </button>
      </div>
      {children}
    </aside>
  );
};

export const ToastRenderer: RuntimeRenderer = ({ node, onEvent, children }) => (
  <div {...shellProps(node, 'toast')} role="status">
    {children}
    {text(node, 'message')}
    {bool(node, 'dismissible') ? (
      <button type="button" onClick={() => emit(node, onEvent, 'dismiss', {})}>
        {text(node, 'dismissLabel', 'Dismiss')}
      </button>
    ) : null}
  </div>
);

export const AlertRenderer: RuntimeRenderer = ({ node, onEvent, children }) => (
  <div {...shellProps(node, 'alert')} role="alert">
    {children}
    {text(node, 'title') === '' ? null : <strong>{text(node, 'title')}</strong>}
    <span>{text(node, 'message')}</span>
    {bool(node, 'dismissible') ? (
      <button type="button" onClick={() => emit(node, onEvent, 'dismiss', {})}>
        {text(node, 'dismissLabel', 'Dismiss')}
      </button>
    ) : null}
  </div>
);

export const TooltipRenderer: RuntimeRenderer = ({ node, children }) => (
  <span
    {...shellProps(node, 'tooltip')}
    title={readText(node, ['content', 'message', 'label'])}
    data-placement={text(node, 'placement', undefined)}
  >
    {children}
    {text(node, 'label')}
  </span>
);

export const FallbackRenderer: RuntimeRenderer = ({ node, children }) => (
  <div {...shellProps(node, 'fallback')}>
    {children}
    {readText(node, ['label', 'content', 'text'])}
    {(node.validationIssues ?? []).map((issue, index) => (
      <div key={`${String(index)}-${issue}`} className="nova-fallback-issue" role="note">
        {issue}
      </div>
    ))}
  </div>
);

export const WEB_RENDERERS: Record<string, RuntimeRenderer> = {
  'nova-web/stack': StackRenderer,
  'nova-web/text': TextRenderer,
  'nova-web/button': ButtonRenderer,
  'nova-web/text-input': TextInputRenderer,
  'nova-web/container': ContainerRenderer,
  'nova-web/row': RowRenderer,
  'nova-web/column': ColumnRenderer,
  'nova-web/grid': GridRenderer,
  'nova-web/section': SectionRenderer,
  'nova-web/tabs': TabsRenderer,
  'nova-web/heading': HeadingRenderer,
  'nova-web/image': ImageRenderer,
  'nova-web/icon': IconRenderer,
  'nova-web/divider': DividerRenderer,
  'nova-web/card': CardRenderer,
  'nova-web/badge': BadgeRenderer,
  'nova-web/textarea': TextareaRenderer,
  'nova-web/number-input': NumberInputRenderer,
  'nova-web/email-input': EmailInputRenderer,
  'nova-web/password-input': PasswordInputRenderer,
  'nova-web/select': SelectRenderer,
  'nova-web/checkbox': CheckboxRenderer,
  'nova-web/radio-group': RadioGroupRenderer,
  'nova-web/date-picker': DatePickerRenderer,
  'nova-web/file-upload': FileUploadRenderer,
  'nova-web/form': FormRenderer,
  'nova-web/link': LinkRenderer,
  'nova-web/dropdown': DropdownRenderer,
  'nova-web/menu': MenuRenderer,
  'nova-web/data-table': DataTableRenderer,
  'nova-web/list': ListRenderer,
  'nova-web/chart': ChartRenderer,
  'nova-web/statistics-card': StatisticsCardRenderer,
  'nova-web/data-grid': DataGridRenderer,
  'nova-web/navbar': NavbarRenderer,
  'nova-web/sidebar': SidebarRenderer,
  'nova-web/breadcrumb': BreadcrumbRenderer,
  'nova-web/pagination': PaginationRenderer,
  'nova-web/modal': ModalRenderer,
  'nova-web/dialog': DialogRenderer,
  'nova-web/drawer': DrawerRenderer,
  'nova-web/toast': ToastRenderer,
  'nova-web/alert': AlertRenderer,
  'nova-web/tooltip': TooltipRenderer
};

export function renderNode(
  node: RuntimeNode,
  options: RenderNodeOptions = {}
): ReactElement | null {
  if (node.hidden || node.props.visible === false) {
    return null;
  }

  const Renderer = WEB_RENDERERS[node.renderer] ?? FallbackRenderer;
  const children: ReactNode[] = [];
  const slots: Record<string, ReactNode[]> = {};

  for (const child of node.children) {
    const rendered = renderNode(child, options);
    if (rendered !== null) {
      children.push(<Fragment key={child.id}>{rendered}</Fragment>);
    }
  }

  for (const [name, nodes] of Object.entries(node.slots)) {
    slots[name] = nodes.flatMap((child) => {
      const rendered = renderNode(child, options);
      return rendered === null ? [] : [<Fragment key={child.id}>{rendered}</Fragment>];
    });
    children.push(...(slots[name] ?? []));
  }

  return (
    <Renderer
      node={node}
      slots={slots}
      runtime={options.runtime ?? emptyRuntimeRenderContext()}
      {...(options.onEvent === undefined ? {} : { onEvent: options.onEvent })}
    >
      {children}
    </Renderer>
  );
}

export type { RuntimeRendererProps };
