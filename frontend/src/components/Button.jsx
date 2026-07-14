import { Loader } from 'lucide-react';
import { forwardRef } from 'react';

/**
 * Button — unified button component with built-in loading state.
 *
 * Props:
 *   variant  - 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'value'
 *   size     - 'sm' | 'md' | 'lg'
 *   loading  - boolean, shows spinner and disables interactions
 *   icon     - optional Lucide icon component (rendered left of label)
 *   as       - override element: 'button' | 'a' | Link component etc.
 *   All other props forwarded to the element (onClick, disabled, type, href, to, etc.)
 */
const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon: Icon,
    children,
    className = '',
    disabled,
    as: Tag = 'button',
    ...rest
  },
  ref
) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const isDisabled = disabled || loading;

  return (
    <Tag ref={ref} className={classes} disabled={isDisabled} {...rest}>
      {loading ? (
        <Loader size={15} className="spinner" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={15} aria-hidden="true" />
      ) : null}
      {children}
    </Tag>
  );
});

export default Button;
