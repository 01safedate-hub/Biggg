/* eslint-disable @next/next/no-img-element */
/** The LaundryPoint logo, served through our own domain so it can be cached and used in app icons. */
export function Logo({ size = 32, className = "", alt = "" }: { size?: number; className?: string; alt?: string }) {
  return <img src="/brand/logo" alt={alt} width={size} height={size} className={`object-contain ${className}`} style={{ height: size, width: size }} />;
}
