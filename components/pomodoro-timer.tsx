'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, RotateCcw, SkipForward, Minus, Plus, X } from 'lucide-react'

interface PomodoroTimerProps {
  onClose: () => void
  currentDeepWork: number
  onDeepWorkUpdate: (minutes: number) => void
}

export function PomodoroTimer({ onClose, currentDeepWork, onDeepWorkUpdate }: PomodoroTimerProps) {
  const [workMinutes, setWorkMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [timeLeft, setTimeLeft] = useState(workMinutes * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [isWorkPhase, setIsWorkPhase] = useState(true)
  const [sessionsCompleted, setSessionsCompleted] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [accumulatedWork, setAccumulatedWork] = useState(currentDeepWork)

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleComplete = useCallback(() => {
    if (isWorkPhase) {
      setSessionsCompleted((prev) => prev + 1)
      const newAccumulated = accumulatedWork + workMinutes
      setAccumulatedWork(newAccumulated)
      onDeepWorkUpdate(newAccumulated)
      setTimeLeft(breakMinutes * 60)
    } else {
      setTimeLeft(workMinutes * 60)
    }
    setIsWorkPhase(!isWorkPhase)
    setIsRunning(false)
  }, [isWorkPhase, workMinutes, breakMinutes, accumulatedWork, onDeepWorkUpdate])

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1)
      }, 1000)
    } else if (timeLeft === 0) {
      handleComplete()
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isRunning, timeLeft, handleComplete])

  const handleReset = () => {
    setIsRunning(false)
    setTimeLeft(isWorkPhase ? workMinutes * 60 : breakMinutes * 60)
  }

  const handleSkip = () => {
    setIsRunning(false)
    if (isWorkPhase) {
      setTimeLeft(breakMinutes * 60)
    } else {
      setTimeLeft(workMinutes * 60)
    }
    setIsWorkPhase(!isWorkPhase)
  }

  const updateWorkMinutes = (delta: number) => {
    const newValue = Math.max(1, Math.min(60, workMinutes + delta))
    setWorkMinutes(newValue)
    if (isWorkPhase && !isRunning) {
      setTimeLeft(newValue * 60)
    }
  }

  const updateBreakMinutes = (delta: number) => {
    const newValue = Math.max(1, Math.min(30, breakMinutes + delta))
    setBreakMinutes(newValue)
    if (!isWorkPhase && !isRunning) {
      setTimeLeft(newValue * 60)
    }
  }

  const totalMinutes = isWorkPhase ? workMinutes : breakMinutes
  const progress = 1 - timeLeft / (totalMinutes * 60)
  const size = 200
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - progress * circumference

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-sm text-primary font-medium"
        >
          {showSettings ? 'Cerrar' : 'Ajustes'}
        </button>
        <h1 className="text-lg font-semibold text-foreground">Pomodoro</h1>
        <button onClick={onClose} className="text-muted-foreground">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="px-6 py-4 bg-card mx-4 rounded-2xl mb-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-foreground">Trabajo (min)</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateWorkMinutes(-5)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-semibold">{workMinutes}</span>
              <button
                onClick={() => updateWorkMinutes(5)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Descanso (min)</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateBreakMinutes(-1)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-semibold">{breakMinutes}</span>
              <button
                onClick={() => updateBreakMinutes(1)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timer */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Phase chip */}
        <div
          className={`px-4 py-1.5 rounded-full text-sm font-medium mb-8 ${
            isWorkPhase
              ? 'bg-primary/10 text-primary'
              : 'bg-blue-100 text-blue-600'
          }`}
        >
          {isWorkPhase ? 'TRABAJO PROFUNDO' : 'DESCANSO'}
        </div>

        {/* Timer ring */}
        <div className="relative flex items-center justify-center mb-8" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              stroke="#E5E7EB"
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              stroke={isWorkPhase ? '#2E9E68' : '#3B82F6'}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-300"
            />
          </svg>
          <span className="absolute text-5xl font-bold text-foreground">
            {formatTime(timeLeft)}
          </span>
        </div>

        {/* Sessions counter */}
        <p className="text-muted-foreground text-sm mb-8">
          Sesiones completadas: <span className="font-semibold text-foreground">{sessionsCompleted}</span>
        </p>

        {/* Controls */}
        <div className="flex items-center gap-6">
          <button
            onClick={handleReset}
            className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
          >
            {isRunning ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>
          <button
            onClick={handleSkip}
            className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Deep work card */}
      <div className="mx-4 mb-8 p-4 bg-card rounded-2xl">
        <p className="text-sm text-muted-foreground text-center">
          Deep work hoy: <span className="font-semibold text-foreground">{accumulatedWork} min</span>
        </p>
      </div>
    </div>
  )
}
