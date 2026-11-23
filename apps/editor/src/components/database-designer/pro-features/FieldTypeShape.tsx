import type { DataFieldType } from '@nova/spec';

type FieldShape = 'circle' | 'square' | 'diamond' | 'triangle';

function shapeForType(type: DataFieldType): { shape: FieldShape; color: string } {
  if (type === 'uuid' || type === 'reference') {
    return { shape: 'diamond', color: '#7c3aed' };
  }
  if (type === 'number' || type === 'integer' || type === 'decimal') {
    return { shape: 'triangle', color: '#2563eb' };
  }
  if (type === 'boolean' || type === 'enum') {
    return { shape: 'square', color: '#059669' };
  }
  if (type === 'date' || type === 'datetime') {
    return { shape: 'circle', color: '#d97706' };
  }
  return { shape: 'circle', color: '#64748b' };
}

export function FieldTypeShape({ type }: { type: DataFieldType }) {
  const { shape, color } = shapeForType(type);
  return (
    <svg
      aria-hidden="true"
      className="designer-field-shape"
      height="9"
      viewBox="0 0 10 10"
      width="9"
    >
      {shape === 'circle' ? <circle cx="5" cy="5" fill={color} r="4" /> : null}
      {shape === 'square' ? <rect fill={color} height="8" width="8" x="1" y="1" /> : null}
      {shape === 'diamond' ? <polygon fill={color} points="5,1 9,5 5,9 1,5" /> : null}
      {shape === 'triangle' ? <polygon fill={color} points="5,1 9,9 1,9" /> : null}
    </svg>
  );
}
