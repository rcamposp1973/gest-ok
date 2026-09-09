import React from 'react';
import { BadgeCheck } from 'lucide-react';

interface AnimatedOkLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
}

export const AnimatedOkLogo: React.FC<AnimatedOkLogoProps> = ({
  size = 'md',
  className = '',
  showText = false,
}) => {
  const sizeMap = {
    sm: { icon: 'w-4 h-4', container: 'w-7 h-7', text: 'text-[9px]' },
    md: { icon: 'w-5 h-5', container: 'w-8 h-8', text: 'text-[10px]' },
    lg: { icon: 'w-6 h-6', container: 'w-9 h-9', text: 'text-xs' },
    xl: { icon: 'w-8 h-8', container: 'w-12 h-12', text: 'text-sm' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* Halo de animación pulsante "OK" */}
      <span className="absolute -inset-1 rounded-full bg-emerald-400/30 animate-ping opacity-75 duration-1000 pointer-events-none" />
      
      {/* Contenedor circular con degradado moderno */}
      <div className={`relative ${currentSize.container} rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-950/40 border border-emerald-300/40 group-hover:scale-105 transition-transform duration-200`}>
        {/* Ícono de aprobación "OK" animado */}
        <BadgeCheck className={`${currentSize.icon} text-emerald-100 animate-pulse`} />
        
        {/* Insignia mínima "OK" sobrepuesta */}
        <span className="absolute -bottom-1 -right-1 bg-emerald-900 border border-emerald-300 text-emerald-200 font-black text-[8px] px-1 rounded-full leading-none py-0.5 tracking-tighter shadow-xs">
          OK
        </span>
      </div>

      {showText && (
        <span className={`ml-2 font-black uppercase tracking-wider text-emerald-400 ${currentSize.text}`}>
          OK
        </span>
      )}
    </div>
  );
};

export default AnimatedOkLogo;
