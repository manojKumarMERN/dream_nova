import type {
  ComponentContract,
  ComponentInspectorField,
  ComponentInspectorFieldOption,
  ComponentInspectorGroup,
  EventContract,
  SlotContract
} from '@nova/contracts';

type JsonSchema = Record<string, unknown>;

interface BuilderContractOptions {
  type: string;
  displayName: string;
  category: ComponentContract['category'];
  description: string;
  icon: string;
  properties: Record<string, JsonSchema>;
  required?: string[];
  defaults: Record<string, unknown>;
  contentFields: string[];
  appearanceFields?: string[];
  layoutFields?: string[];
  behaviorFields?: string[];
  events: Record<string, EventContract>;
  slots?: Record<string, SlotContract>;
  capabilities: string[];
  constraints?: ComponentContract['constraints'];
  resizable?: boolean;
  options?: Record<string, ComponentInspectorFieldOption[]>;
  widgetOverrides?: Record<string, ComponentInspectorField['widget']>;
  help?: Record<string, string>;
}

const BASE_PROPERTIES: Record<string, JsonSchema> = {
  className: { type: 'string' },
  variant: { type: 'string', enum: ['default', 'primary', 'secondary'] },
  gap: { type: 'number', minimum: 0 },
  disabled: { type: 'boolean' },
  visible: { type: 'boolean' }
};

const BASE_DEFAULTS: Record<string, unknown> = {
  className: '',
  variant: 'default',
  gap: 0,
  disabled: false,
  visible: true
};

const NODE_PAYLOAD: Record<string, JsonSchema> = {
  nodeId: { type: 'string', format: 'uuid' },
  type: { type: 'string' }
};

function selectSchema(values: readonly string[]): JsonSchema {
  return { type: 'string', enum: [...values] };
}

function optionsSchema(): JsonSchema {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string', minLength: 1 },
        value: { type: 'string', minLength: 1 }
      },
      required: ['label', 'value'],
      additionalProperties: false
    }
  };
}

function linksSchema(): JsonSchema {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string', minLength: 1 },
        href: { type: 'string' }
      },
      required: ['label'],
      additionalProperties: false
    }
  };
}

const COLUMNS_SCHEMA: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      key: { type: 'string', minLength: 1 },
      label: { type: 'string', minLength: 1 }
    },
    required: ['key', 'label'],
    additionalProperties: false
  }
};

const ROWS_SCHEMA: JsonSchema = {
  type: 'array',
  items: { type: 'object', additionalProperties: true }
};

const CHART_DATA_SCHEMA: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      label: { type: 'string', minLength: 1 },
      value: { type: 'number' }
    },
    required: ['label', 'value'],
    additionalProperties: false
  }
};

function event(description: string, properties: Record<string, JsonSchema> = {}): EventContract {
  return {
    description,
    payloadSchema: {
      type: 'object',
      properties,
      additionalProperties: false
    }
  };
}

function withMount(events: Record<string, EventContract>): Record<string, EventContract> {
  return {
    mount: event('Triggered when the component mounts', NODE_PAYLOAD),
    ...events
  };
}

function contentSlot(description: string): Record<string, SlotContract> {
  return {
    default: {
      description,
      multiple: true
    }
  };
}

function labelFromPath(path: string): string {
  return path
    .split(/[._-]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function enumOptions(schema: JsonSchema): ComponentInspectorFieldOption[] | undefined {
  const values = schema['enum'];
  if (!Array.isArray(values)) {
    return undefined;
  }

  const options = values
    .filter(
      (value): value is string | number | boolean =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    )
    .map((value) => ({ label: String(value), value }));

  return options.length > 0 ? options : undefined;
}

function createBuilderContract(definition: BuilderContractOptions): ComponentContract {
  const properties = { ...BASE_PROPERTIES, ...definition.properties };
  const defaults = { ...BASE_DEFAULTS, ...definition.defaults };

  function buildField(path: string): ComponentInspectorField {
    const property = properties[path] ?? {};
    const type = property['type'];
    let widget = definition.widgetOverrides?.[path];

    if (widget === undefined) {
      const options = definition.options?.[path] ?? enumOptions(property);
      if (definition.options?.[path] !== undefined || options !== undefined) {
        widget = 'select';
      } else if (type === 'boolean') {
        widget = 'boolean';
      } else if (type === 'number' || type === 'integer') {
        widget = 'number';
      } else if (path.toLowerCase().includes('color')) {
        widget = 'color';
      } else if (path === 'src' || path.toLowerCase().includes('image')) {
        widget = 'image';
      } else if (path === 'content' || path === 'message' || path === 'text') {
        widget = 'textarea';
      } else if (type === 'object' || type === 'array') {
        widget = 'json';
      } else if (path === 'workflowId' || path.toLowerCase().includes('workflow')) {
        widget = 'workflow';
      } else if (path.toLowerCase().includes('binding')) {
        widget = 'binding';
      } else {
        widget = 'text';
      }
    }

    const field: ComponentInspectorField = {
      path,
      label: labelFromPath(path),
      widget
    };
    const options = definition.options?.[path] ?? enumOptions(property);
    if (options !== undefined) {
      field.options = options;
    }
    const help = definition.help?.[path];
    if (help !== undefined) {
      field.help = help;
    }
    return field;
  }

  function buildGroup(
    id: string,
    label: string,
    paths: readonly string[]
  ): ComponentInspectorGroup {
    return {
      id,
      label,
      fields: paths.map(buildField)
    };
  }

  const contract: ComponentContract = {
    type: definition.type,
    version: '1.0.0',
    displayName: definition.displayName,
    category: definition.category,
    description: definition.description,
    icon: definition.icon,
    propsSchema: {
      type: 'object',
      properties,
      required: [...(definition.required ?? [])],
      additionalProperties: false
    },
    defaults,
    events: withMount(definition.events),
    slots: definition.slots ?? {},
    capabilities: definition.capabilities,
    supportedTargets: ['web'],
    renderers: {
      web: `nova-web/${definition.type.replace(/^nova\./, '')}`
    },
    constraints: definition.constraints ?? {},
    migrations: [],
    inspector: {
      groups: [
        buildGroup('content', 'Content', definition.contentFields),
        buildGroup('appearance', 'Appearance', [
          'className',
          'variant',
          ...(definition.appearanceFields ?? [])
        ]),
        buildGroup('layout', 'Layout', ['gap', ...(definition.layoutFields ?? [])]),
        buildGroup('behavior', 'Behavior', [
          'disabled',
          'visible',
          ...(definition.behaviorFields ?? [])
        ])
      ]
    },
    resize: {
      enabled: definition.resizable === true,
      minWidth: 80,
      minHeight: 24,
      lockAspectRatio: false
    },
    supportedBreakpoints: ['desktop', 'tablet', 'mobile']
  };

  return contract;
}

const CHANGE_EVENT = event('Triggered when the value changes', { value: {} });
const CLICK_EVENT = event('Triggered when the component is clicked', NODE_PAYLOAD);
const OPEN_EVENT = event('Triggered when the component opens', NODE_PAYLOAD);
const CLOSE_EVENT = event('Triggered when the component closes', NODE_PAYLOAD);

export const BUILDER_COMPONENT_CONTRACTS: readonly ComponentContract[] = [
  createBuilderContract({
    type: 'nova.container',
    displayName: 'Container',
    category: 'layout',
    description: 'A general-purpose content container',
    icon: 'square',
    properties: {
      label: { type: 'string' },
      padding: { type: 'number', minimum: 0 },
      maxWidth: { type: 'string', minLength: 1 },
      alignItems: selectSchema(['start', 'center', 'end', 'stretch'])
    },
    defaults: { label: '', padding: 16, maxWidth: '1200px', alignItems: 'start' },
    contentFields: ['label'],
    layoutFields: ['padding', 'maxWidth', 'alignItems'],
    behaviorFields: ['disabled'],
    events: { click: CLICK_EVENT },
    slots: contentSlot('Content rendered inside the container'),
    capabilities: ['layout', 'nested-children'],
    constraints: { maxChildren: 100 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.row',
    displayName: 'Row',
    category: 'layout',
    description: 'A horizontal flex row',
    icon: 'columns',
    properties: {
      label: { type: 'string' },
      alignItems: selectSchema(['start', 'center', 'end', 'stretch']),
      justifyContent: selectSchema(['start', 'center', 'end', 'between']),
      wrap: { type: 'boolean' }
    },
    defaults: { label: '', alignItems: 'start', justifyContent: 'start', wrap: false },
    contentFields: ['label'],
    layoutFields: ['alignItems', 'justifyContent'],
    behaviorFields: ['wrap'],
    events: { click: CLICK_EVENT },
    slots: contentSlot('Cells rendered in the row'),
    capabilities: ['layout', 'nested-children'],
    constraints: { maxChildren: 100 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.column',
    displayName: 'Column',
    category: 'layout',
    description: 'A vertical flex column',
    icon: 'rows',
    properties: {
      label: { type: 'string' },
      alignItems: selectSchema(['start', 'center', 'end', 'stretch']),
      reverse: { type: 'boolean' }
    },
    defaults: { label: '', alignItems: 'stretch', reverse: false },
    contentFields: ['label'],
    layoutFields: ['alignItems'],
    behaviorFields: ['reverse'],
    events: { click: CLICK_EVENT },
    slots: contentSlot('Components rendered in the column'),
    capabilities: ['layout', 'nested-children'],
    constraints: { maxChildren: 100 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.grid',
    displayName: 'Grid',
    category: 'layout',
    description: 'A responsive CSS grid container',
    icon: 'grid',
    properties: {
      label: { type: 'string' },
      columns: { type: 'integer', minimum: 1, maximum: 12 },
      rows: { type: 'integer', minimum: 1, maximum: 12 },
      autoFlow: selectSchema(['row', 'column'])
    },
    defaults: { label: '', columns: 3, rows: 1, autoFlow: 'row' },
    contentFields: ['label'],
    layoutFields: ['columns', 'rows', 'autoFlow'],
    behaviorFields: ['disabled'],
    events: { click: CLICK_EVENT },
    slots: contentSlot('Grid cell components'),
    capabilities: ['layout', 'nested-children'],
    constraints: { maxChildren: 144 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.section',
    displayName: 'Section',
    category: 'layout',
    description: 'A titled page section',
    icon: 'panel-top',
    properties: {
      title: { type: 'string', minLength: 1 },
      subtitle: { type: 'string' },
      padding: { type: 'number', minimum: 0 },
      maxWidth: { type: 'string', minLength: 1 },
      collapsible: { type: 'boolean' }
    },
    required: ['title'],
    defaults: {
      title: 'Section',
      subtitle: '',
      padding: 24,
      maxWidth: '1200px',
      collapsible: false
    },
    contentFields: ['title', 'subtitle'],
    layoutFields: ['padding', 'maxWidth'],
    behaviorFields: ['collapsible'],
    events: {
      click: CLICK_EVENT,
      toggle: event('Triggered when the section is collapsed', { collapsed: { type: 'boolean' } })
    },
    slots: contentSlot('Section body components'),
    capabilities: ['layout', 'nested-children'],
    constraints: { maxChildren: 100 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.tabs',
    displayName: 'Tabs',
    category: 'layout',
    description: 'A tabbed content container',
    icon: 'tabs',
    properties: {
      items: optionsSchema(),
      activeValue: { type: 'string', minLength: 1 },
      orientation: selectSchema(['horizontal', 'vertical']),
      lazy: { type: 'boolean' }
    },
    required: ['items', 'activeValue'],
    defaults: {
      items: [{ label: 'Tab 1', value: 'tab-1' }],
      activeValue: 'tab-1',
      orientation: 'horizontal',
      lazy: false
    },
    contentFields: ['items', 'activeValue'],
    layoutFields: ['orientation'],
    behaviorFields: ['lazy'],
    events: {
      change: event('Triggered when the active tab changes', { value: { type: 'string' } })
    },
    slots: { panels: { description: 'Tab panel components', multiple: true } },
    capabilities: ['layout', 'nested-children', 'interaction'],
    constraints: { maxChildren: 50 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.heading',
    displayName: 'Heading',
    category: 'basic',
    description: 'A section heading with a configurable level',
    icon: 'heading',
    properties: {
      content: { type: 'string', minLength: 1 },
      level: selectSchema(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
      align: selectSchema(['left', 'center', 'right']),
      truncate: { type: 'boolean' }
    },
    required: ['content'],
    defaults: { content: 'Heading', level: 'h2', align: 'left', truncate: false },
    contentFields: ['content'],
    appearanceFields: ['level'],
    layoutFields: ['align'],
    behaviorFields: ['truncate'],
    events: { click: CLICK_EVENT },
    capabilities: ['text-rendering'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.image',
    displayName: 'Image',
    category: 'basic',
    description: 'A responsive image',
    icon: 'image',
    properties: {
      src: { type: 'string', minLength: 1 },
      alt: { type: 'string' },
      fit: selectSchema(['cover', 'contain', 'fill']),
      width: { type: 'string', minLength: 1 },
      height: { type: 'string', minLength: 1 },
      lazy: { type: 'boolean' }
    },
    required: ['src'],
    defaults: {
      src: 'https://example.com/image.png',
      alt: '',
      fit: 'cover',
      width: '100%',
      height: 'auto',
      lazy: true
    },
    contentFields: ['src', 'alt'],
    appearanceFields: ['fit'],
    layoutFields: ['width', 'height'],
    behaviorFields: ['lazy'],
    events: { load: event('Triggered when the image loads', { src: { type: 'string' } }) },
    capabilities: ['image-rendering'],
    constraints: {},
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.icon',
    displayName: 'Icon',
    category: 'basic',
    description: 'A vector icon',
    icon: 'sparkles',
    properties: {
      name: { type: 'string', minLength: 1 },
      size: { type: 'number', minimum: 1 },
      color: { type: 'string', minLength: 1 },
      spin: { type: 'boolean' }
    },
    required: ['name'],
    defaults: { name: 'star', size: 24, color: '#4f46e5', spin: false },
    contentFields: ['name'],
    appearanceFields: ['size', 'color'],
    behaviorFields: ['spin'],
    events: { click: CLICK_EVENT },
    capabilities: ['icon-rendering'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.divider',
    displayName: 'Divider',
    category: 'basic',
    description: 'A horizontal or vertical separator',
    icon: 'minus',
    properties: {
      label: { type: 'string' },
      orientation: selectSchema(['horizontal', 'vertical']),
      thickness: { type: 'number', minimum: 1 },
      inset: { type: 'number', minimum: 0 },
      decorative: { type: 'boolean' }
    },
    defaults: { label: '', orientation: 'horizontal', thickness: 1, inset: 0, decorative: true },
    contentFields: ['label'],
    appearanceFields: ['orientation', 'thickness'],
    layoutFields: ['inset'],
    behaviorFields: ['decorative'],
    events: { click: CLICK_EVENT },
    capabilities: ['layout'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.card',
    displayName: 'Card',
    category: 'basic',
    description: 'A bordered surface for grouped content',
    icon: 'credit-card',
    properties: {
      title: { type: 'string', minLength: 1 },
      subtitle: { type: 'string' },
      elevation: { type: 'integer', minimum: 0, maximum: 5 },
      padding: { type: 'number', minimum: 0 },
      interactive: { type: 'boolean' }
    },
    required: ['title'],
    defaults: { title: 'Card', subtitle: '', elevation: 1, padding: 16, interactive: false },
    contentFields: ['title', 'subtitle'],
    appearanceFields: ['elevation'],
    layoutFields: ['padding'],
    behaviorFields: ['interactive'],
    events: { click: CLICK_EVENT },
    slots: contentSlot('Card body components'),
    capabilities: ['layout', 'nested-children'],
    constraints: { maxChildren: 50 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.badge',
    displayName: 'Badge',
    category: 'basic',
    description: 'A compact status label',
    icon: 'tag',
    properties: {
      text: { type: 'string', minLength: 1 },
      tone: selectSchema(['neutral', 'success', 'warning', 'danger']),
      size: selectSchema(['sm', 'md', 'lg']),
      dot: { type: 'boolean' }
    },
    required: ['text'],
    defaults: { text: 'Badge', tone: 'neutral', size: 'md', dot: false },
    contentFields: ['text'],
    appearanceFields: ['tone', 'size'],
    behaviorFields: ['dot'],
    events: { click: CLICK_EVENT },
    capabilities: ['status-display'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.textarea',
    displayName: 'Textarea',
    category: 'input',
    description: 'A multiline text field',
    icon: 'align-left',
    properties: {
      label: { type: 'string', minLength: 1 },
      placeholder: { type: 'string' },
      rows: { type: 'integer', minimum: 1, maximum: 20 },
      required: { type: 'boolean' },
      autoGrow: { type: 'boolean' }
    },
    required: ['label'],
    defaults: { label: 'Message', placeholder: '', rows: 4, required: false, autoGrow: false },
    contentFields: ['label', 'placeholder'],
    layoutFields: ['rows'],
    behaviorFields: ['required', 'autoGrow'],
    events: { change: CHANGE_EVENT },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.number-input',
    displayName: 'Number Input',
    category: 'input',
    description: 'A numeric input field',
    icon: 'hash',
    properties: {
      label: { type: 'string', minLength: 1 },
      min: { type: 'number' },
      max: { type: 'number' },
      step: { type: 'number', exclusiveMinimum: 0 },
      required: { type: 'boolean' }
    },
    required: ['label'],
    defaults: { label: 'Number', min: 0, max: 100, step: 1, required: false },
    contentFields: ['label'],
    behaviorFields: ['required'],
    events: {
      change: event('Triggered when the numeric value changes', { value: { type: 'number' } })
    },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.email-input',
    displayName: 'Email Input',
    category: 'input',
    description: 'An email address field',
    icon: 'mail',
    properties: {
      label: { type: 'string', minLength: 1 },
      placeholder: { type: 'string' },
      required: { type: 'boolean' },
      autocomplete: { type: 'string' }
    },
    required: ['label'],
    defaults: {
      label: 'Email',
      placeholder: 'name@example.com',
      required: false,
      autocomplete: 'email'
    },
    contentFields: ['label', 'placeholder'],
    behaviorFields: ['required', 'autocomplete'],
    events: { change: CHANGE_EVENT },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.password-input',
    displayName: 'Password Input',
    category: 'input',
    description: 'A masked password field',
    icon: 'lock',
    properties: {
      name: { type: 'string', minLength: 1 },
      label: { type: 'string', minLength: 1 },
      placeholder: { type: 'string' },
      minLength: { type: 'integer', minimum: 0 },
      showToggle: { type: 'boolean' },
      required: { type: 'boolean' }
    },
    required: ['label'],
    defaults: {
      name: '',
      label: 'Password',
      placeholder: '',
      minLength: 8,
      showToggle: true,
      required: true
    },
    contentFields: ['label', 'placeholder'],
    behaviorFields: ['name', 'minLength', 'showToggle', 'required'],
    events: { change: CHANGE_EVENT },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.select',
    displayName: 'Select',
    category: 'input',
    description: 'A single or multiple option select field',
    icon: 'chevrons-up-down',
    properties: {
      label: { type: 'string', minLength: 1 },
      options: optionsSchema(),
      placeholder: { type: 'string' },
      multiple: { type: 'boolean' },
      searchable: { type: 'boolean' }
    },
    required: ['label', 'options'],
    defaults: {
      label: 'Select',
      options: [{ label: 'Option 1', value: 'option-1' }],
      placeholder: 'Choose an option',
      multiple: false,
      searchable: false
    },
    contentFields: ['label', 'options', 'placeholder'],
    behaviorFields: ['multiple', 'searchable'],
    events: { change: CHANGE_EVENT },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.checkbox',
    displayName: 'Checkbox',
    category: 'input',
    description: 'A boolean checkbox field',
    icon: 'check-square',
    properties: {
      label: { type: 'string', minLength: 1 },
      description: { type: 'string' },
      checked: { type: 'boolean' },
      indeterminate: { type: 'boolean' }
    },
    required: ['label'],
    defaults: { label: 'Checkbox', description: '', checked: false, indeterminate: false },
    contentFields: ['label', 'description'],
    behaviorFields: ['checked', 'indeterminate'],
    events: {
      change: event('Triggered when the checkbox state changes', { checked: { type: 'boolean' } })
    },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.radio-group',
    displayName: 'Radio Group',
    category: 'input',
    description: 'A group of mutually exclusive options',
    icon: 'circle-dot',
    properties: {
      label: { type: 'string', minLength: 1 },
      options: optionsSchema(),
      value: { type: 'string' },
      inline: { type: 'boolean' },
      required: { type: 'boolean' }
    },
    required: ['label', 'options'],
    defaults: {
      label: 'Radio Group',
      options: [{ label: 'Option 1', value: 'option-1' }],
      value: 'option-1',
      inline: false,
      required: false
    },
    contentFields: ['label', 'options', 'value'],
    layoutFields: ['inline'],
    behaviorFields: ['required'],
    events: { change: CHANGE_EVENT },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.date-picker',
    displayName: 'Date Picker',
    category: 'input',
    description: 'A calendar date selection field',
    icon: 'calendar',
    properties: {
      label: { type: 'string', minLength: 1 },
      placeholder: { type: 'string' },
      format: { type: 'string', minLength: 1 },
      minDate: { type: 'string' },
      maxDate: { type: 'string' },
      required: { type: 'boolean' }
    },
    required: ['label'],
    defaults: {
      label: 'Date',
      placeholder: 'Select a date',
      format: 'YYYY-MM-DD',
      minDate: '',
      maxDate: '',
      required: false
    },
    contentFields: ['label', 'placeholder'],
    appearanceFields: ['format'],
    layoutFields: ['minDate', 'maxDate'],
    behaviorFields: ['required'],
    events: { change: CHANGE_EVENT },
    capabilities: ['data-entry', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.file-upload',
    displayName: 'File Upload',
    category: 'input',
    description: 'A file selection and upload field',
    icon: 'upload',
    properties: {
      label: { type: 'string', minLength: 1 },
      accept: { type: 'string' },
      maxSizeMb: { type: 'number', exclusiveMinimum: 0 },
      multiple: { type: 'boolean' },
      required: { type: 'boolean' }
    },
    required: ['label'],
    defaults: {
      label: 'Upload files',
      accept: '*/*',
      maxSizeMb: 10,
      multiple: false,
      required: false
    },
    contentFields: ['label', 'accept'],
    behaviorFields: ['maxSizeMb', 'multiple', 'required'],
    events: {
      change: event('Triggered when the selected files change', {
        files: { type: 'array', items: { type: 'string' } }
      })
    },
    capabilities: ['data-entry', 'interaction', 'file-upload'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.link',
    displayName: 'Link',
    category: 'action',
    description: 'A navigational hyperlink',
    icon: 'link',
    properties: {
      label: { type: 'string', minLength: 1 },
      href: { type: 'string', minLength: 1 },
      target: selectSchema(['_self', '_blank']),
      underline: { type: 'boolean' },
      external: { type: 'boolean' }
    },
    required: ['label', 'href'],
    defaults: {
      label: 'Link',
      href: '/',
      target: '_self',
      underline: true,
      external: false
    },
    contentFields: ['label', 'href'],
    appearanceFields: ['underline'],
    behaviorFields: ['target', 'external'],
    events: {
      navigate: event('Triggered when the link is followed', { href: { type: 'string' } })
    },
    capabilities: ['navigation', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.dropdown',
    displayName: 'Dropdown',
    category: 'action',
    description: 'A button that reveals a list of actions',
    icon: 'chevron-down',
    properties: {
      label: { type: 'string', minLength: 1 },
      items: optionsSchema(),
      placement: selectSchema(['bottom-start', 'bottom-end', 'top-start', 'top-end']),
      open: { type: 'boolean' }
    },
    required: ['label', 'items'],
    defaults: {
      label: 'Actions',
      items: [{ label: 'Action 1', value: 'action-1' }],
      placement: 'bottom-start',
      open: false
    },
    contentFields: ['label', 'items'],
    layoutFields: ['placement'],
    behaviorFields: ['open'],
    events: {
      select: event('Triggered when an item is selected', { value: { type: 'string' } })
    },
    slots: { items: { description: 'Custom dropdown items', multiple: true } },
    capabilities: ['interaction', 'navigation'],
    constraints: { maxChildren: 50 }
  }),
  createBuilderContract({
    type: 'nova.menu',
    displayName: 'Menu',
    category: 'action',
    description: 'A navigational menu',
    icon: 'menu',
    properties: {
      items: linksSchema(),
      orientation: selectSchema(['horizontal', 'vertical']),
      collapsible: { type: 'boolean' }
    },
    required: ['items'],
    defaults: {
      items: [{ label: 'Home', href: '/' }],
      orientation: 'horizontal',
      collapsible: false
    },
    contentFields: ['items'],
    layoutFields: ['orientation'],
    behaviorFields: ['collapsible'],
    events: {
      navigate: event('Triggered when a menu item is followed', { href: { type: 'string' } })
    },
    slots: { items: { description: 'Custom menu entries', multiple: true } },
    capabilities: ['navigation', 'nested-children'],
    constraints: { maxChildren: 50 }
  }),
  createBuilderContract({
    type: 'nova.data-table',
    displayName: 'Data Table',
    category: 'data',
    description: 'A sortable tabular data view',
    icon: 'table',
    properties: {
      title: { type: 'string' },
      columns: COLUMNS_SCHEMA,
      rows: ROWS_SCHEMA,
      pageSize: { type: 'integer', minimum: 1, maximum: 200 },
      sortable: { type: 'boolean' },
      selectable: { type: 'boolean' }
    },
    required: ['columns', 'rows'],
    defaults: {
      title: '',
      columns: [{ key: 'name', label: 'Name' }],
      rows: [],
      pageSize: 20,
      sortable: true,
      selectable: false
    },
    contentFields: ['title', 'columns', 'rows'],
    layoutFields: ['pageSize'],
    behaviorFields: ['sortable', 'selectable'],
    events: {
      rowClick: event('Triggered when a row is clicked', { row: { type: 'object' } }),
      sort: event('Triggered when a column is sorted', {
        key: { type: 'string' },
        direction: { type: 'string' }
      })
    },
    slots: { empty: { description: 'Content shown when there are no rows', multiple: true } },
    capabilities: ['data-display', 'pagination'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.list',
    displayName: 'List',
    category: 'data',
    description: 'An ordered or unordered item list',
    icon: 'list',
    properties: {
      title: { type: 'string' },
      items: linksSchema(),
      emptyText: { type: 'string' },
      ordered: { type: 'boolean' },
      divider: { type: 'boolean' }
    },
    required: ['items'],
    defaults: {
      title: '',
      items: [],
      emptyText: 'No items',
      ordered: false,
      divider: true
    },
    contentFields: ['title', 'items', 'emptyText'],
    appearanceFields: ['ordered', 'divider'],
    behaviorFields: ['disabled'],
    events: {
      itemClick: event('Triggered when a list item is clicked', { index: { type: 'number' } })
    },
    slots: { empty: { description: 'Content shown for an empty list', multiple: true } },
    capabilities: ['data-display', 'nested-children'],
    constraints: { maxChildren: 200 }
  }),
  createBuilderContract({
    type: 'nova.chart',
    displayName: 'Chart',
    category: 'data',
    description: 'A data visualization chart',
    icon: 'chart-column',
    properties: {
      title: { type: 'string' },
      chartType: selectSchema(['bar', 'line', 'area', 'pie']),
      data: CHART_DATA_SCHEMA,
      height: { type: 'number', minimum: 1 },
      showLegend: { type: 'boolean' }
    },
    required: ['data'],
    defaults: {
      title: '',
      chartType: 'bar',
      data: [],
      height: 240,
      showLegend: true
    },
    contentFields: ['title', 'data'],
    appearanceFields: ['chartType'],
    layoutFields: ['height'],
    behaviorFields: ['showLegend'],
    events: {
      pointClick: event('Triggered when a data point is clicked', {
        label: { type: 'string' },
        value: { type: 'number' }
      })
    },
    slots: { empty: { description: 'Content shown when there is no data', multiple: true } },
    capabilities: ['data-display', 'visualization'],
    constraints: {},
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.statistics-card',
    displayName: 'Statistics Card',
    category: 'data',
    description: 'A compact key metric display',
    icon: 'trending-up',
    properties: {
      label: { type: 'string', minLength: 1 },
      value: { type: 'string', minLength: 1 },
      delta: { type: 'string' },
      trend: selectSchema(['up', 'down', 'flat']),
      compact: { type: 'boolean' }
    },
    required: ['label', 'value'],
    defaults: { label: 'Metric', value: '0', delta: '', trend: 'flat', compact: false },
    contentFields: ['label', 'value', 'delta'],
    appearanceFields: ['trend'],
    layoutFields: ['compact'],
    behaviorFields: ['disabled'],
    events: { click: CLICK_EVENT },
    capabilities: ['data-display', 'status-display'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.data-grid',
    displayName: 'Data Grid',
    category: 'data',
    description: 'An editable high-density data grid',
    icon: 'table-2',
    properties: {
      title: { type: 'string' },
      columns: COLUMNS_SCHEMA,
      rows: ROWS_SCHEMA,
      pageSize: { type: 'integer', minimum: 1, maximum: 200 },
      selectable: { type: 'boolean' },
      editable: { type: 'boolean' }
    },
    required: ['columns', 'rows'],
    defaults: {
      title: '',
      columns: [{ key: 'name', label: 'Name' }],
      rows: [],
      pageSize: 25,
      selectable: true,
      editable: false
    },
    contentFields: ['title', 'columns', 'rows'],
    layoutFields: ['pageSize'],
    behaviorFields: ['selectable', 'editable'],
    events: {
      cellChange: event('Triggered when a cell value changes', {
        rowIndex: { type: 'number' },
        key: { type: 'string' },
        value: {}
      })
    },
    slots: { empty: { description: 'Content shown when the grid is empty', multiple: true } },
    capabilities: ['data-display', 'pagination', 'data-entry'],
    constraints: {},
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.navbar',
    displayName: 'Navbar',
    category: 'navigation',
    description: 'A top navigation bar',
    icon: 'panel-top',
    properties: {
      brand: { type: 'string', minLength: 1 },
      links: linksSchema(),
      sticky: { type: 'boolean' },
      compact: { type: 'boolean' }
    },
    required: ['brand'],
    defaults: {
      brand: 'NOVA',
      links: [{ label: 'Home', href: '/' }],
      sticky: false,
      compact: false
    },
    contentFields: ['brand', 'links'],
    appearanceFields: ['compact'],
    layoutFields: ['gap'],
    behaviorFields: ['sticky'],
    events: {
      navigate: event('Triggered when a navigation link is followed', { href: { type: 'string' } })
    },
    slots: { actions: { description: 'Trailing navbar actions', multiple: true } },
    capabilities: ['navigation', 'nested-children'],
    constraints: { maxChildren: 30 }
  }),
  createBuilderContract({
    type: 'nova.sidebar',
    displayName: 'Sidebar',
    category: 'navigation',
    description: 'A side navigation panel',
    icon: 'panel-left',
    properties: {
      title: { type: 'string' },
      items: linksSchema(),
      position: selectSchema(['left', 'right']),
      width: { type: 'number', minimum: 1 },
      collapsible: { type: 'boolean' }
    },
    required: ['items'],
    defaults: {
      title: '',
      items: [{ label: 'Home', href: '/' }],
      position: 'left',
      width: 240,
      collapsible: true
    },
    contentFields: ['title', 'items'],
    layoutFields: ['position', 'width'],
    behaviorFields: ['collapsible'],
    events: {
      navigate: event('Triggered when a sidebar item is followed', { href: { type: 'string' } })
    },
    slots: { footer: { description: 'Sidebar footer components', multiple: true } },
    capabilities: ['navigation', 'nested-children'],
    constraints: { maxChildren: 100 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.breadcrumb',
    displayName: 'Breadcrumb',
    category: 'navigation',
    description: 'A hierarchical navigation trail',
    icon: 'chevron-right',
    properties: {
      items: linksSchema(),
      separator: { type: 'string', minLength: 1 },
      maxItems: { type: 'integer', minimum: 1 }
    },
    required: ['items'],
    defaults: {
      items: [{ label: 'Home', href: '/' }],
      separator: '/',
      maxItems: 8
    },
    contentFields: ['items'],
    appearanceFields: ['separator'],
    layoutFields: ['maxItems'],
    behaviorFields: ['disabled'],
    events: {
      navigate: event('Triggered when a breadcrumb is followed', { href: { type: 'string' } })
    },
    capabilities: ['navigation'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.pagination',
    displayName: 'Pagination',
    category: 'navigation',
    description: 'Page navigation controls',
    icon: 'more-horizontal',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 200 },
      total: { type: 'integer', minimum: 0 },
      size: selectSchema(['sm', 'md', 'lg']),
      showSummary: { type: 'boolean' }
    },
    defaults: { page: 1, pageSize: 20, total: 0, size: 'md', showSummary: true },
    contentFields: ['page', 'pageSize', 'total'],
    appearanceFields: ['size'],
    behaviorFields: ['showSummary'],
    events: {
      change: event('Triggered when the page changes', { page: { type: 'number' } })
    },
    capabilities: ['navigation', 'pagination', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.modal',
    displayName: 'Modal',
    category: 'feedback',
    description: 'A centered overlay dialog',
    icon: 'app-window',
    properties: {
      title: { type: 'string', minLength: 1 },
      message: { type: 'string' },
      size: selectSchema(['sm', 'md', 'lg']),
      open: { type: 'boolean' },
      closable: { type: 'boolean' }
    },
    required: ['title'],
    defaults: { title: 'Modal', message: '', size: 'md', open: false, closable: true },
    contentFields: ['title', 'message'],
    appearanceFields: ['size'],
    behaviorFields: ['open', 'closable'],
    events: { open: OPEN_EVENT, close: CLOSE_EVENT },
    slots: contentSlot('Modal body components'),
    capabilities: ['overlay', 'nested-children'],
    constraints: { maxChildren: 50 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.dialog',
    displayName: 'Dialog',
    category: 'feedback',
    description: 'A confirmation dialog with explicit actions',
    icon: 'message-square',
    properties: {
      title: { type: 'string', minLength: 1 },
      message: { type: 'string' },
      confirmLabel: { type: 'string', minLength: 1 },
      cancelLabel: { type: 'string', minLength: 1 },
      open: { type: 'boolean' }
    },
    required: ['title'],
    defaults: {
      title: 'Are you sure?',
      message: '',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      open: false
    },
    contentFields: ['title', 'message', 'confirmLabel', 'cancelLabel'],
    behaviorFields: ['open'],
    events: {
      confirm: event('Triggered when the dialog is confirmed', NODE_PAYLOAD),
      cancel: event('Triggered when the dialog is cancelled', NODE_PAYLOAD)
    },
    slots: contentSlot('Additional dialog content'),
    capabilities: ['overlay', 'nested-children'],
    constraints: { maxChildren: 50 }
  }),
  createBuilderContract({
    type: 'nova.drawer',
    displayName: 'Drawer',
    category: 'feedback',
    description: 'A sliding side panel',
    icon: 'panel-right',
    properties: {
      title: { type: 'string', minLength: 1 },
      placement: selectSchema(['left', 'right']),
      width: { type: 'number', minimum: 1 },
      open: { type: 'boolean' }
    },
    required: ['title'],
    defaults: { title: 'Drawer', placement: 'right', width: 360, open: false },
    contentFields: ['title'],
    layoutFields: ['placement', 'width'],
    behaviorFields: ['open'],
    events: { open: OPEN_EVENT, close: CLOSE_EVENT },
    slots: contentSlot('Drawer body components'),
    capabilities: ['overlay', 'nested-children'],
    constraints: { maxChildren: 50 },
    resizable: true
  }),
  createBuilderContract({
    type: 'nova.toast',
    displayName: 'Toast',
    category: 'feedback',
    description: 'A transient notification',
    icon: 'bell',
    properties: {
      message: { type: 'string', minLength: 1 },
      tone: selectSchema(['info', 'success', 'warning', 'error']),
      duration: { type: 'number', minimum: 0 },
      position: selectSchema(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
      dismissible: { type: 'boolean' }
    },
    required: ['message'],
    defaults: {
      message: 'Notification',
      tone: 'info',
      duration: 5000,
      position: 'top-right',
      dismissible: true
    },
    contentFields: ['message'],
    appearanceFields: ['tone'],
    layoutFields: ['position'],
    behaviorFields: ['duration', 'dismissible'],
    events: { dismiss: event('Triggered when the toast is dismissed', NODE_PAYLOAD) },
    capabilities: ['notification', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.alert',
    displayName: 'Alert',
    category: 'feedback',
    description: 'An inline status message',
    icon: 'triangle-alert',
    properties: {
      title: { type: 'string' },
      message: { type: 'string', minLength: 1 },
      tone: selectSchema(['info', 'success', 'warning', 'error']),
      dismissible: { type: 'boolean' }
    },
    required: ['message'],
    defaults: {
      title: '',
      message: 'Something needs your attention',
      tone: 'info',
      dismissible: false
    },
    contentFields: ['title', 'message'],
    appearanceFields: ['tone'],
    behaviorFields: ['dismissible'],
    events: { dismiss: event('Triggered when the alert is dismissed', NODE_PAYLOAD) },
    capabilities: ['status-display', 'interaction'],
    constraints: {}
  }),
  createBuilderContract({
    type: 'nova.tooltip',
    displayName: 'Tooltip',
    category: 'feedback',
    description: 'A contextual hint shown on hover or focus',
    icon: 'message-circle',
    properties: {
      content: { type: 'string', minLength: 1 },
      placement: selectSchema(['top', 'right', 'bottom', 'left']),
      delay: { type: 'number', minimum: 0 },
      interactive: { type: 'boolean' }
    },
    required: ['content'],
    defaults: { content: 'More information', placement: 'top', delay: 200, interactive: false },
    contentFields: ['content'],
    layoutFields: ['placement'],
    behaviorFields: ['delay', 'interactive'],
    events: { show: event('Triggered when the tooltip becomes visible', NODE_PAYLOAD) },
    slots: contentSlot('Tooltip trigger and content'),
    capabilities: ['overlay'],
    constraints: { maxChildren: 10 }
  })
];
