import React from 'react';

// FIX: Updated ButtonProps to support polymorphism with an 'as' prop and allow additional props like 'to' for links.
type ButtonProps = React.PropsWithChildren<{
  variant?: 'primary' | 'outline' | 'luxury';
  size?: 'sm' | 'md' | 'lg';
  as?: React.ElementType;
  className?: string;
  [x: string]: any;
}>;

// Restyling editoriale: rettangolo netto, etichetta in maiuscolo spaziato,
// il riempimento entra al passaggio del mouse. Le varianti e le taglie sono
// le stesse di prima (stessi nomi, stesso significato): cambia solo il
// vestito, nessun chiamante va toccato.
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', as: Component = 'button', ...props }, ref) => {
    const baseClasses =
      "inline-flex items-center justify-center gap-2 border font-medium uppercase leading-none whitespace-nowrap transition-colors duration-500 ease-editorial focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#C8A24A] disabled:opacity-40 disabled:cursor-not-allowed";

    const variantClasses = {
      primary: "bg-white border-white text-black hover:bg-transparent hover:text-white",
      outline: "bg-transparent border-white/25 text-white hover:bg-white hover:border-white hover:text-black",
      luxury: "bg-transparent border-[#C8A24A]/55 text-[#C8A24A] hover:bg-[#C8A24A] hover:border-[#C8A24A] hover:text-black",
    };

    const sizeClasses = {
      sm: "px-5 py-2.5 text-[10px] tracking-[0.18em]",
      md: "px-7 py-3.5 text-[11px] tracking-[0.18em]",
      lg: "px-10 py-5 text-xs tracking-[0.2em]",
    };

    const finalClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

    return <Component className={finalClasses} ref={ref} {...props} />;
  }
);

Button.displayName = 'Button';

export { Button };
