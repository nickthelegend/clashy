// Price with the trailing digits dimmed, pump/fomo style: $72.27 -> "$72." + dim "27"
export function Money({ value, decimals = 2, className = '' }: { value: number; decimals?: number; className?: string }) {
  const s = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const [int, frac] = s.split('.')
  return (
    <span className={`num ${className}`}>
      ${int}
      {frac !== undefined && <span className="cents">.{frac}</span>}
    </span>
  )
}
