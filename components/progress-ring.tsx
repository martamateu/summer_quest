'use client'

interface ProgressRingProps {
  progress: number
  total: number
  size?: number
  strokeWidth?: number
  color?: string
}

export function ProgressRing({
  progress,
  total,
  size = 160,
  strokeWidth = 12,
  color = '#4F7BE8',
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const percent = total > 0 ? progress / total : 0
  const offset = circumference - percent * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke="#E5E7EB"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{progress}/{total}</span>
        <span className="text-sm text-muted-foreground">hábitos</span>
      </div>
    </div>
  )
}
