"use client"

import type React from "react"

import { useRef, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { RotateCcw, Download, Wind, ArrowDown, Zap, RotateCw, Sparkles, Wand2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export default function SimpleFluidCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [colorMode, setColorMode] = useState(0)
  const lastPos = useRef({ x: 0, y: 0 })
  const particles = useRef<Array<Particle>>([])
  const animationRef = useRef<number>(0)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const patternIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const patternAnimationRef = useRef<number>(0)
  const [colorSelected, setColorSelected] = useState(false)

  // Physics settings
  const [showPhysicsControls, setShowPhysicsControls] = useState(false)
  const [gravityEnabled, setGravityEnabled] = useState(false)
  const [gravityStrength, setGravityStrength] = useState(0.05)
  const [windEnabled, setWindEnabled] = useState(false)
  const [windStrength, setWindStrength] = useState(0.1)
  const [turbulenceEnabled, setTurbulenceEnabled] = useState(false)
  const [turbulenceStrength, setTurbulenceStrength] = useState(0.2)
  const [vortexEnabled, setVortexEnabled] = useState(false)
  const [vortexStrength, setVortexStrength] = useState(0.15)
  const vortexCenter = useRef({ x: 0, y: 0 })
  const timeOffset = useRef(0)

  // Pattern generation settings
  const [showPatternControls, setShowPatternControls] = useState(false)
  const [patternType, setPatternType] = useState("spiral")
  const [patternActive, setPatternActive] = useState(false)
  const [patternDensity, setPatternDensity] = useState(50)
  const [patternSpeed, setPatternSpeed] = useState(50)
  const [patternSize, setPatternSize] = useState(50)
  const patternProgress = useRef(0)
  const patternCenter = useRef({ x: 0, y: 0 })

  // Toggle pattern controls
  const togglePatternControls = () => {
    setShowPatternControls(!showPatternControls)
  }

  // Toggle physics controls
  const togglePhysicsControls = () => {
    setShowPhysicsControls(!showPhysicsControls)
  }

  // Particle class for fluid simulation
  class Particle {
    x: number
    y: number
    vx: number
    vy: number
    color: string
    size: number
    life: number
    maxLife: number
    opacity: number
    mass: number

    constructor(x: number, y: number, color: string, size = 0) {
      this.x = x
      this.y = y
      this.vx = 0
      this.vy = 0
      this.color = color
      this.size = size || Math.random() * 20 + 15
      this.life = 0
      this.maxLife = Math.random() * 100 + 80
      this.opacity = 1
      this.mass = this.size / 10 // Mass proportional to size
    }

    update(time: number) {
      // Apply physics forces
      this.applyPhysics(time)

      // Update position based on velocity
      this.x += this.vx
      this.y += this.vy

      // Apply velocity decay (air resistance)
      this.vx *= 0.97
      this.vy *= 0.97

      this.life++

      // Special effect for rainbow mode (colorMode 4)
      if (colorMode === 4 && this.life % 3 === 0) {
        // Gradually shift the color for rainbow particles
        const hue = Number.parseInt(this.color.split("(")[1].split(",")[0], 10)
        const saturation = Number.parseInt(this.color.split(",")[1].trim(), 10)
        const lightness = Number.parseInt(this.color.split(",")[2].split("%")[0].trim(), 10)
        const newHue = (hue + 3) % 360
        this.color = `hsl(${newHue}, ${saturation}%, ${lightness}%)`
      }

      // Check if any physics effects are active
      const physicsActive = gravityEnabled || windEnabled || turbulenceEnabled || vortexEnabled

      // Slower size reduction when physics is active
      if (physicsActive) {
        this.size -= this.size * 0.005 // Half the reduction rate
      } else {
        this.size -= this.size * 0.01
      }

      // Slower opacity reduction when physics is active
      if (physicsActive) {
        this.opacity = 1 - this.life / (this.maxLife * 1.5) // 50% longer lifetime
      } else {
        this.opacity = 1 - this.life / this.maxLife
      }

      // Boundary checks with bounce
      const dpr = window.devicePixelRatio || 1
      const maxWidth = canvasSize.width / dpr
      const maxHeight = canvasSize.height / dpr

      if (this.x < 0) {
        this.x = 0
        this.vx *= -0.5 // Bounce with energy loss
      } else if (this.x > maxWidth) {
        this.x = maxWidth
        this.vx *= -0.5
      }

      if (this.y < 0) {
        this.y = 0
        this.vy *= -0.5
      } else if (this.y > maxHeight) {
        this.y = maxHeight
        this.vy *= -0.5
      }

      return this.life < this.maxLife && this.size > 0.5
    }

    applyPhysics(time: number) {
      // Gravity
      if (gravityEnabled) {
        this.vy += gravityStrength / this.mass
      }

      // Wind (time-varying horizontal force)
      if (windEnabled) {
        const windForce = Math.sin(time * 0.001 + this.y * 0.01) * windStrength
        this.vx += windForce / this.mass
      }

      // Turbulence (perlin-like noise)
      if (turbulenceEnabled) {
        const turbX = Math.sin(this.x * 0.01 + time * 0.001) * Math.cos(this.y * 0.01 + time * 0.002)
        const turbY = Math.sin(this.y * 0.01 + time * 0.002) * Math.cos(this.x * 0.01 + time * 0.001)
        this.vx += (turbX * turbulenceStrength) / this.mass
        this.vy += (turbY * turbulenceStrength) / this.mass
      }

      // Vortex (swirling effect around center)
      if (vortexEnabled) {
        const dx = this.x - vortexCenter.current.x
        const dy = this.y - vortexCenter.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance > 0) {
          // Calculate tangential force (perpendicular to radius)
          const strength = vortexStrength / (distance * 0.1)
          this.vx += (-dy * strength) / this.mass
          this.vy += (dx * strength) / this.mass
        }
      }
    }

    draw(ctx: CanvasRenderingContext2D) {
      ctx.globalAlpha = this.opacity
      ctx.fillStyle = this.color
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Color palettes
  const getColor = (x: number, y: number, time: number) => {
    const palettes = [
      // Vibrant
      [
        `hsl(${(x / canvasSize.width) * 360 + time * 10}, 80%, 60%)`,
        `hsl(${(y / canvasSize.height) * 360 + time * 5}, 90%, 50%)`,
      ],
      // Earth tones
      [
        `hsl(${(x / canvasSize.width) * 60 + 20 + time * 2}, 70%, 40%)`,
        `hsl(${(y / canvasSize.height) * 40 + 30 + time * 1}, 60%, 50%)`,
      ],
      // Neon
      [
        `hsl(${(x / canvasSize.width) * 300 + 180 + time * 15}, 100%, 60%)`,
        `hsl(${(y / canvasSize.height) * 240 + 120 + time * 10}, 100%, 70%)`,
      ],
      // Monochrome
      [`hsl(0, 0%, ${(x / canvasSize.width) * 50 + 30}%)`, `hsl(0, 0%, ${(y / canvasSize.height) * 70 + 20}%)`],
      // Rainbow
      [`hsl(${(time * 20) % 360}, 100%, 50%)`, `hsl(${(time * 20 + 180) % 360}, 100%, 60%)`],
      // Ocean Blues
      [
        `hsl(${195 + (x / canvasSize.width) * 30}, 90%, ${40 + (y / canvasSize.height) * 20}%)`,
        `hsl(${210 + (y / canvasSize.height) * 20}, 80%, ${50 + (x / canvasSize.width) * 10}%)`,
      ],
      // Sunset
      [
        `hsl(${10 + (x / canvasSize.width) * 40}, 90%, ${50 + (y / canvasSize.height) * 10}%)`,
        `hsl(${30 + (y / canvasSize.height) * 20}, 100%, ${60 + (x / canvasSize.width) * 10}%)`,
      ],
      // Galaxy
      [
        `hsl(${270 + (x / canvasSize.width) * 30}, 80%, ${30 + (y / canvasSize.height) * 20}%)`,
        `hsl(${290 + (y / canvasSize.height) * 20}, 90%, ${20 + (x / canvasSize.width) * 30}%)`,
      ],
      // Forest
      [
        `hsl(${100 + (x / canvasSize.width) * 40}, 70%, ${30 + (y / canvasSize.height) * 20}%)`,
        `hsl(${120 + (y / canvasSize.height) * 30}, 80%, ${20 + (x / canvasSize.width) * 30}%)`,
      ],
    ]

    const palette = palettes[colorMode]
    const colorIndex = Math.floor(Math.random() * palette.length)
    return palette[colorIndex]
  }

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return

    // Set canvas size
    const updateSize = () => {
      if (!canvasRef.current) return
      const canvas = canvasRef.current

      // Get the display size of the canvas
      const displayWidth = window.innerWidth
      const displayHeight = window.innerHeight

      // Set display size (CSS pixels)
      canvas.style.width = `${displayWidth}px`
      canvas.style.height = `${displayHeight}px`

      // Get the device pixel ratio
      const dpr = window.devicePixelRatio || 1

      // Set actual size in memory (scaled to account for extra pixel density)
      canvas.width = Math.floor(displayWidth * dpr)
      canvas.height = Math.floor(displayHeight * dpr)

      setCanvasSize({ width: canvas.width, height: canvas.height })

      // Set vortex center to middle of canvas
      vortexCenter.current = {
        x: displayWidth / 2,
        y: displayHeight / 2,
      }

      // Set pattern center to middle of canvas
      patternCenter.current = {
        x: displayWidth / 2,
        y: displayHeight / 2,
      }

      // Get context
      const context = canvas.getContext("2d", { alpha: false })
      if (context) {
        // Scale all drawing operations by the dpr
        context.scale(dpr, dpr)
        contextRef.current = context

        // Fill with black background
        context.fillStyle = "#000"
        context.fillRect(0, 0, displayWidth, displayHeight)
      }
    }

    updateSize()
    window.addEventListener("resize", updateSize)

    // Start animation
    startAnimation()

    // Initialize time offset
    timeOffset.current = Date.now()

    return () => {
      window.removeEventListener("resize", updateSize)
      stopAnimation()
      stopPatternGeneration()
    }
  }, [])

  // Animation loop
  const animate = (time: number) => {
    if (!contextRef.current) return
    const ctx = contextRef.current

    // Current time for physics calculations
    const currentTime = Date.now()

    // Apply fade effect - reduce fade when physics effects are active
    const physicsActive = gravityEnabled || windEnabled || turbulenceEnabled || vortexEnabled

    if (particles.current.length === 0) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)" // Stronger fade when canvas is being reset
    } else if (physicsActive) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.01)" // Very light fade when physics is active
    } else {
      ctx.fillStyle = "rgba(0, 0, 0, 0.03)" // Normal fade during drawing
    }

    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr
    ctx.fillRect(0, 0, displayWidth, displayHeight)

    // Update and draw particles
    particles.current = particles.current.filter((particle) => {
      const isAlive = particle.update(currentTime)
      if (isAlive) {
        particle.draw(ctx)
      }
      return isAlive
    })

    // Add ambient particles occasionally (only if a color is selected)
    if (Math.random() < 0.4 && colorSelected) {
      const x = (Math.random() * canvasSize.width) / (window.devicePixelRatio || 1)
      const y = (Math.random() * canvasSize.height) / (window.devicePixelRatio || 1)
      const color = getColor(x, y, time / 1000)
      const particle = new Particle(x, y, color)
      particle.vx = (Math.random() - 0.5) * 2
      particle.vy = (Math.random() - 0.5) * 2

      // Make particles more dynamic based on color mode
      if (colorMode === 4) {
        // Rainbow
        particle.size = Math.random() * 8 + 3
        particle.maxLife = Math.random() * 150 + 100
      } else {
        particle.size = Math.random() * 6 + 3
      }

      particles.current.push(particle)
    }

    // Continue animation
    animationRef.current = requestAnimationFrame(animate)
  }

  const startAnimation = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    animationRef.current = requestAnimationFrame(animate)
  }

  const stopAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
  }

  // Pattern generation functions
  const generatePattern = () => {
    if (!contextRef.current) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr

    // Update pattern center occasionally to make it more dynamic
    if (Math.random() < 0.05) {
      patternCenter.current = {
        x: Math.random() * displayWidth,
        y: Math.random() * displayHeight,
      }
    }

    const time = Date.now() / 1000
    const speedFactor = patternSpeed / 50 // Normalize to 0-1 range

    switch (patternType) {
      case "spiral":
        generateSpiralPattern(time, speedFactor)
        break
      case "wave":
        generateWavePattern(time, speedFactor)
        break
      case "starburst":
        generateStarburstPattern(time, speedFactor)
        break
      case "grid":
        generateGridPattern(time, speedFactor)
        break
      case "fractal":
        generateFractalPattern(time, speedFactor)
        break
      default:
        generateSpiralPattern(time, speedFactor)
    }

    patternProgress.current += speedFactor * 0.01
    if (patternProgress.current > 1) patternProgress.current = 0

    // Schedule next pattern generation
    patternAnimationRef.current = requestAnimationFrame(generatePattern)
  }

  const generateSpiralPattern = (time: number, speedFactor: number) => {
    if (!colorSelected) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr

    const centerX = patternCenter.current.x
    const centerY = patternCenter.current.y
    const maxRadius = Math.min(displayWidth, displayHeight) * (patternSize / 100) * 0.4
    const particleCount = Math.floor((patternDensity / 100) * 20) + 5

    for (let i = 0; i < particleCount; i++) {
      const angle = patternProgress.current * Math.PI * 20 + (i / particleCount) * Math.PI * 2
      const radius = (patternProgress.current + i / particleCount) * maxRadius

      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius

      if (x >= 0 && x <= displayWidth && y >= 0 && y <= displayHeight) {
        const color = getColor(x, y, time)
        const particle = new Particle(x, y, color, 5 + Math.random() * 10)

        // Add velocity tangent to the spiral
        const tangentAngle = angle + Math.PI / 2
        particle.vx = Math.cos(tangentAngle) * speedFactor * 2
        particle.vy = Math.sin(tangentAngle) * speedFactor * 2

        particles.current.push(particle)
      }
    }
  }

  const generateWavePattern = (time: number, speedFactor: number) => {
    if (!colorSelected) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr

    const waveCount = Math.floor((patternSize / 100) * 5) + 1
    const particleCount = Math.floor((patternDensity / 100) * 30) + 10

    for (let i = 0; i < particleCount; i++) {
      const x = (i / particleCount) * displayWidth
      const waveHeight = (patternSize / 100) * displayHeight * 0.3

      // Multiple overlapping waves
      let y = displayHeight / 2
      for (let w = 1; w <= waveCount; w++) {
        y += Math.sin((x / displayWidth) * Math.PI * w * 2 + time * speedFactor * w) * (waveHeight / waveCount)
      }

      const color = getColor(x, y, time)
      const particle = new Particle(x, y, color, 4 + Math.random() * 8)

      // Add slight vertical velocity based on wave direction
      const nextX = ((i + 1) / particleCount) * displayWidth
      let nextY = displayHeight / 2
      for (let w = 1; w <= waveCount; w++) {
        nextY += Math.sin((nextX / displayWidth) * Math.PI * w * 2 + time * speedFactor * w) * (waveHeight / waveCount)
      }

      const angle = Math.atan2(nextY - y, nextX - x)
      particle.vx = Math.cos(angle) * speedFactor * 2
      particle.vy = Math.sin(angle) * speedFactor * 2

      particles.current.push(particle)
    }
  }

  const generateStarburstPattern = (time: number, speedFactor: number) => {
    if (!colorSelected) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr

    const centerX = patternCenter.current.x
    const centerY = patternCenter.current.y
    const rayCount = Math.floor((patternDensity / 100) * 20) + 5
    const maxRadius = Math.min(displayWidth, displayHeight) * (patternSize / 100) * 0.4

    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2
      const radius = (0.2 + Math.sin(time * speedFactor * 2) * 0.1) * maxRadius

      const particlesPerRay = 3 + Math.floor(Math.random() * 3)

      for (let j = 0; j < particlesPerRay; j++) {
        const r = (j / particlesPerRay) * radius
        const x = centerX + Math.cos(angle) * r
        const y = centerY + Math.sin(angle) * r

        if (x >= 0 && x <= displayWidth && y >= 0 && y <= displayHeight) {
          const color = getColor(x, y, time)
          const particle = new Particle(x, y, color, 4 + Math.random() * 8)

          // Add velocity outward from center
          particle.vx = Math.cos(angle) * speedFactor * 3
          particle.vy = Math.sin(angle) * speedFactor * 3

          particles.current.push(particle)
        }
      }
    }
  }

  const generateGridPattern = (time: number, speedFactor: number) => {
    if (!colorSelected) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr

    const gridSize = Math.max(3, Math.floor((patternSize / 100) * 15))
    const cellWidth = displayWidth / gridSize
    const cellHeight = displayHeight / gridSize

    // Only generate particles for some cells based on density
    const activeCellChance = patternDensity / 100

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        if (Math.random() < activeCellChance) {
          const centerX = (x + 0.5) * cellWidth
          const centerY = (y + 0.5) * cellHeight

          // Add some variation to position
          const offsetX = Math.sin(time * speedFactor + x * y) * 0.3 * cellWidth
          const offsetY = Math.cos(time * speedFactor + x + y) * 0.3 * cellHeight

          const posX = centerX + offsetX
          const posY = centerY + offsetY

          const color = getColor(posX, posY, time)
          const particle = new Particle(posX, posY, color, 5 + Math.random() * 10)

          // Add slight velocity based on the offset direction
          particle.vx = offsetX * speedFactor * 0.5
          particle.vy = offsetY * speedFactor * 0.5

          particles.current.push(particle)
        }
      }
    }
  }

  const generateFractalPattern = (time: number, speedFactor: number) => {
    if (!colorSelected) return

    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr

    const centerX = patternCenter.current.x
    const centerY = patternCenter.current.y
    const maxRadius = Math.min(displayWidth, displayHeight) * (patternSize / 100) * 0.4

    // Generate a fractal-like pattern using recursive branching
    const branchCount = Math.floor((patternDensity / 100) * 5) + 2
    const angleOffset = time * speedFactor

    const generateBranch = (x: number, y: number, angle: number, length: number, depth: number) => {
      if (depth <= 0 || length < 5) return

      const endX = x + Math.cos(angle) * length
      const endY = y + Math.sin(angle) * length

      // Add particles along the branch
      const particleCount = Math.floor(length / 10) + 1
      for (let i = 0; i < particleCount; i++) {
        const t = i / particleCount
        const px = x + (endX - x) * t
        const py = y + (endY - y) * t

        if (px >= 0 && px <= displayWidth && py >= 0 && py <= displayHeight) {
          const color = getColor(px, py, time)
          const particle = new Particle(px, py, color, 3 + Math.random() * 5)

          // Add slight velocity in branch direction
          particle.vx = Math.cos(angle) * speedFactor
          particle.vy = Math.sin(angle) * speedFactor

          particles.current.push(particle)
        }
      }

      // Create sub-branches
      for (let i = 0; i < branchCount; i++) {
        const newAngle = angle + (i / branchCount) * Math.PI - Math.PI / 2 + Math.sin(time * speedFactor) * 0.5
        generateBranch(endX, endY, newAngle, length * 0.6, depth - 1)
      }
    }

    // Start with a few main branches
    const mainBranches = 3 + Math.floor((patternDensity / 100) * 3)
    for (let i = 0; i < mainBranches; i++) {
      const angle = (i / mainBranches) * Math.PI * 2 + angleOffset
      generateBranch(centerX, centerY, angle, maxRadius * 0.3, 2)
    }
  }

  // Start pattern generation
  const startPatternGeneration = () => {
    if (patternIntervalRef.current) {
      clearInterval(patternIntervalRef.current)
    }

    // Reset pattern progress
    patternProgress.current = 0

    // Set pattern center to middle of canvas initially
    const dpr = window.devicePixelRatio || 1
    patternCenter.current = {
      x: canvasSize.width / (2 * dpr),
      y: canvasSize.height / (2 * dpr),
    }

    // Start the pattern animation
    if (patternAnimationRef.current) {
      cancelAnimationFrame(patternAnimationRef.current)
    }
    patternAnimationRef.current = requestAnimationFrame(generatePattern)

    setPatternActive(true)
  }

  // Stop pattern generation
  const stopPatternGeneration = () => {
    if (patternIntervalRef.current) {
      clearInterval(patternIntervalRef.current)
      patternIntervalRef.current = null
    }

    if (patternAnimationRef.current) {
      cancelAnimationFrame(patternAnimationRef.current)
    }

    setPatternActive(false)
  }

  // Toggle pattern generation
  const togglePatternGeneration = () => {
    if (patternActive) {
      stopPatternGeneration()
    } else {
      startPatternGeneration()
    }
  }

  // Change color mode with toggle behavior
  const changeColorMode = (mode: number) => {
    if (colorMode === mode && colorSelected) {
      // If clicking the same color that's already selected, unselect it
      setColorSelected(false)
    } else {
      // Otherwise, select the new color
      setColorMode(mode)
      setColorSelected(true)
    }
  }

  // Handle mouse/touch events
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true)
    const { x, y } = getPointerPosition(e)
    lastPos.current = { x, y }

    // Update vortex center when starting to draw
    if (vortexEnabled) {
      vortexCenter.current = { x, y }
    }

    // Update pattern center when starting to draw
    if (patternActive) {
      patternCenter.current = { x, y }
    }
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !contextRef.current) return

    const { x, y } = getPointerPosition(e)
    const ctx = contextRef.current
    const time = Date.now()

    // Calculate velocity based on movement
    const dx = x - lastPos.current.x
    const dy = y - lastPos.current.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Only add colored particles if a color is selected
    if (colorSelected) {
      // Add particles along the path
      const steps = Math.max(3, Math.floor(distance / 2))
      for (let i = 0; i < steps; i++) {
        const t = i / steps
        const px = lastPos.current.x + dx * t
        const py = lastPos.current.y + dy * t
        const color = getColor(px, py, time / 1000)

        // Create main particle
        const particle = new Particle(px, py, color, 15 + Math.random() * 10)
        particle.vx = dx * 0.2
        particle.vy = dy * 0.2
        particles.current.push(particle)

        // Add some smaller particles for more fluid effect
        for (let j = 0; j < 3; j++) {
          const smallParticle = new Particle(
            px + (Math.random() - 0.5) * 10,
            py + (Math.random() - 0.5) * 10,
            color,
            5 + Math.random() * 8,
          )
          smallParticle.vx = dx * 0.1 + (Math.random() - 0.5) * 1
          smallParticle.vy = dy * 0.1 + (Math.random() - 0.5) * 1
          particles.current.push(smallParticle)
        }
      }
    }

    lastPos.current = { x, y }

    // Update vortex center when drawing if vortex is enabled
    if (vortexEnabled) {
      vortexCenter.current = {
        x: vortexCenter.current.x * 0.95 + x * 0.05,
        y: vortexCenter.current.y * 0.95 + y * 0.05,
      }
    }

    // Update pattern center when drawing if pattern is active
    if (patternActive) {
      patternCenter.current = {
        x: patternCenter.current.x * 0.95 + x * 0.05,
        y: patternCenter.current.y * 0.95 + y * 0.05,
      }
    }
  }

  // Handle hover effects
  const handleHover = (e: React.MouseEvent) => {
    if (isDrawing || !colorSelected) return

    const { x, y } = getPointerPosition(e)
    const time = Date.now()

    // Create subtle hover effect
    if (Math.random() < 0.4) {
      const color = getColor(x, y, time / 1000)
      const particle = new Particle(x, y, color)
      particle.vx = (Math.random() - 0.5) * 2
      particle.vy = (Math.random() - 0.5) * 2
      particle.size = Math.random() * 8 + 2
      particles.current.push(particle)
    }
  }

  // Helper to get pointer position
  const getPointerPosition = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 }

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    let clientX, clientY
    if ("touches" in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    // Calculate the correct position based on device pixel ratio
    const dpr = window.devicePixelRatio || 1
    const x = (((clientX - rect.left) / rect.width) * canvas.width) / dpr
    const y = (((clientY - rect.top) / rect.height) * canvas.height) / dpr

    return { x, y }
  }

  // Reset canvas
  const resetCanvas = () => {
    if (!contextRef.current || !canvasRef.current) return

    // Stop animation loop temporarily
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    const ctx = contextRef.current
    const dpr = window.devicePixelRatio || 1
    const displayWidth = canvasSize.width / dpr
    const displayHeight = canvasSize.height / dpr

    // Clear the canvas with solid black (no transparency)
    ctx.globalAlpha = 1.0
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, displayWidth, displayHeight)

    // Clear all particles
    particles.current = []

    // Stop pattern generation if active
    if (patternActive) {
      stopPatternGeneration()
    }

    // Reset physics effects
    setGravityEnabled(false)
    setWindEnabled(false)
    setTurbulenceEnabled(false)
    setVortexEnabled(false)

    // Reset pattern controls panel visibility
    setShowPatternControls(false)
    setShowPhysicsControls(false)

    // Reset color selection
    setColorSelected(false)

    // Reset pattern center and vortex center
    patternCenter.current = {
      x: displayWidth / 2,
      y: displayHeight / 2,
    }
    vortexCenter.current = {
      x: displayWidth / 2,
      y: displayHeight / 2,
    }

    // Restart animation loop
    startAnimation()
  }

  // Save canvas as image
  const saveAsImage = () => {
    if (!canvasRef.current) return

    const link = document.createElement("a")
    link.download = "fluid-art.png"
    link.href = canvasRef.current.toDataURL("image/png")
    link.click()
  }

  // Color palette button components
  const ColorButton = ({ mode, gradient, label }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={`bg-white/10 border-white/20 hover:bg-white/20 ${colorMode === mode && colorSelected ? "ring-2 ring-white" : ""}`}
            onClick={() => changeColorMode(mode)}
            aria-label={label}
          >
            <div className={`w-4 h-4 rounded-full ${gradient}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  // Physics control button component
  const PhysicsButton = ({ enabled, setEnabled, icon, label, color = "text-white" }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={`bg-white/10 border-white/20 hover:bg-white/20 ${enabled ? `ring-2 ring-${color.replace("text-", "")}` : ""}`}
            onClick={() => setEnabled(!enabled)}
            aria-label={label}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  return (
    <div className="relative w-full h-screen bg-black">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        onMouseDown={startDrawing}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
        onMouseMove={(e) => {
          if (isDrawing) {
            draw(e)
          } else {
            handleHover(e)
          }
        }}
        onTouchStart={startDrawing}
        onTouchEnd={stopDrawing}
        onTouchCancel={stopDrawing}
        onTouchMove={draw}
      />

      {/* UI Controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <div className="flex flex-wrap gap-2 bg-black/30 backdrop-blur-sm p-2 rounded-lg max-w-[300px] justify-end">
          <ColorButton mode={0} gradient="bg-gradient-to-r from-blue-500 to-purple-500" label="Vibrant colors" />
          <ColorButton mode={1} gradient="bg-gradient-to-r from-amber-700 to-green-800" label="Earth tones" />
          <ColorButton mode={2} gradient="bg-gradient-to-r from-pink-500 to-cyan-400" label="Neon colors" />
          <ColorButton mode={3} gradient="bg-gradient-to-r from-gray-600 to-gray-300" label="Monochrome" />
          <ColorButton mode={4} gradient="bg-gradient-to-r from-red-500 via-green-500 to-blue-500" label="Rainbow" />
          <ColorButton mode={5} gradient="bg-gradient-to-r from-blue-600 to-cyan-300" label="Ocean Blues" />
          <ColorButton mode={6} gradient="bg-gradient-to-r from-red-500 to-yellow-400" label="Sunset" />
          <ColorButton mode={7} gradient="bg-gradient-to-r from-purple-800 to-pink-400" label="Galaxy" />
          <ColorButton mode={8} gradient="bg-gradient-to-r from-green-800 to-lime-500" label="Forest" />
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`bg-black/30 backdrop-blur-sm border-white/20 hover:bg-white/20 ${showPatternControls ? "ring-2 ring-white" : ""}`}
                onClick={togglePatternControls}
                aria-label="Pattern controls"
              >
                <Sparkles className="h-4 w-4 text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Pattern Controls</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`bg-black/30 backdrop-blur-sm border-white/20 hover:bg-white/20 ${showPhysicsControls ? "ring-2 ring-white" : ""}`}
                onClick={togglePhysicsControls}
                aria-label="Physics controls"
              >
                <Zap className="h-4 w-4 text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Physics Controls</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button
          variant="outline"
          size="icon"
          className="bg-black/30 backdrop-blur-sm border-white/20 hover:bg-white/20"
          onClick={resetCanvas}
          aria-label="Reset canvas"
        >
          <RotateCcw className="h-4 w-4 text-white" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="bg-black/30 backdrop-blur-sm border-white/20 hover:bg-white/20"
          onClick={saveAsImage}
          aria-label="Save as image"
        >
          <Download className="h-4 w-4 text-white" />
        </Button>
      </div>

      {/* Pattern Controls Panel */}
      {showPatternControls && (
        <div className="absolute top-20 right-4 bg-black/50 backdrop-blur-md p-4 rounded-lg w-64 space-y-4">
          <h3 className="text-white font-medium text-sm mb-2">Pattern Generator</h3>

          <div className="flex items-center justify-between">
            <Label htmlFor="pattern-toggle" className="text-white text-sm">
              {patternActive ? "Active" : "Inactive"}
            </Label>
            <Switch id="pattern-toggle" checked={patternActive} onCheckedChange={togglePatternGeneration} />
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pattern-type" className="text-xs text-white/70">
                Pattern Type
              </Label>
              <Select value={patternType} onValueChange={setPatternType}>
                <SelectTrigger id="pattern-type" className="bg-black/30 border-white/20 text-white">
                  <SelectValue placeholder="Select pattern" />
                </SelectTrigger>
                <SelectContent className="bg-black/90 border-white/20 text-white">
                  <SelectItem value="spiral">Spiral</SelectItem>
                  <SelectItem value="wave">Wave</SelectItem>
                  <SelectItem value="starburst">Starburst</SelectItem>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="fractal">Fractal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <Label className="text-xs text-white/70">Density</Label>
                <span className="text-xs text-white/70">{patternDensity}</span>
              </div>
              <Slider
                value={[patternDensity]}
                min={10}
                max={100}
                step={5}
                onValueChange={(value) => setPatternDensity(value[0])}
                className="my-1"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <Label className="text-xs text-white/70">Speed</Label>
                <span className="text-xs text-white/70">{patternSpeed}</span>
              </div>
              <Slider
                value={[patternSpeed]}
                min={10}
                max={100}
                step={5}
                onValueChange={(value) => setPatternSpeed(value[0])}
                className="my-1"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <Label className="text-xs text-white/70">Size</Label>
                <span className="text-xs text-white/70">{patternSize}</span>
              </div>
              <Slider
                value={[patternSize]}
                min={10}
                max={100}
                step={5}
                onValueChange={(value) => setPatternSize(value[0])}
                className="my-1"
              />
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-white/10 border-white/20 hover:bg-white/20"
                onClick={() => {
                  if (patternActive) {
                    stopPatternGeneration()
                    startPatternGeneration()
                  } else {
                    startPatternGeneration()
                  }
                }}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                {patternActive ? "Restart Pattern" : "Generate Pattern"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Physics Controls Panel */}
      {showPhysicsControls && (
        <div className="absolute top-20 right-4 bg-black/50 backdrop-blur-md p-4 rounded-lg w-64 space-y-4">
          <h3 className="text-white font-medium text-sm mb-2">Physics Effects</h3>

          <div className="flex justify-between gap-2">
            <PhysicsButton
              enabled={gravityEnabled}
              setEnabled={setGravityEnabled}
              icon={<ArrowDown className="h-4 w-4 text-yellow-400" />}
              label="Gravity"
              color="text-yellow-400"
            />
            <PhysicsButton
              enabled={windEnabled}
              setEnabled={setWindEnabled}
              icon={<Wind className="h-4 w-4 text-blue-400" />}
              label="Wind"
              color="text-blue-400"
            />
            <PhysicsButton
              enabled={turbulenceEnabled}
              setEnabled={setTurbulenceEnabled}
              icon={<Zap className="h-4 w-4 text-purple-400" />}
              label="Turbulence"
              color="text-purple-400"
            />
            <PhysicsButton
              enabled={vortexEnabled}
              setEnabled={setVortexEnabled}
              icon={<RotateCw className="h-4 w-4 text-green-400" />}
              label="Vortex"
              color="text-green-400"
            />
          </div>

          {gravityEnabled && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-white/70">Gravity Strength</label>
                <span className="text-xs text-white/70">{gravityStrength.toFixed(2)}</span>
              </div>
              <Slider
                value={[gravityStrength]}
                min={0.01}
                max={0.2}
                step={0.01}
                onValueChange={(value) => setGravityStrength(value[0])}
                className="my-1"
              />
            </div>
          )}

          {windEnabled && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-white/70">Wind Strength</label>
                <span className="text-xs text-white/70">{windStrength.toFixed(2)}</span>
              </div>
              <Slider
                value={[windStrength]}
                min={0.01}
                max={0.3}
                step={0.01}
                onValueChange={(value) => setWindStrength(value[0])}
                className="my-1"
              />
            </div>
          )}

          {turbulenceEnabled && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-white/70">Turbulence Strength</label>
                <span className="text-xs text-white/70">{turbulenceStrength.toFixed(2)}</span>
              </div>
              <Slider
                value={[turbulenceStrength]}
                min={0.05}
                max={0.5}
                step={0.01}
                onValueChange={(value) => setTurbulenceStrength(value[0])}
                className="my-1"
              />
            </div>
          )}

          {vortexEnabled && (
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-white/70">Vortex Strength</label>
                <span className="text-xs text-white/70">{vortexStrength.toFixed(2)}</span>
              </div>
              <Slider
                value={[vortexStrength]}
                min={0.05}
                max={0.5}
                step={0.01}
                onValueChange={(value) => setVortexStrength(value[0])}
                className="my-1"
              />
              <p className="text-xs text-white/70 italic">Vortex follows your cursor when drawing</p>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 text-sm text-white/70 bg-black/30 backdrop-blur-sm p-2 rounded-md max-w-xs">
        <p>Click a color to select it, click again to deselect</p>
        <p>Click and drag to create fluid effects</p>
        <p>Use the sparkles button to generate automatic patterns</p>
        <p>Use the physics button to add gravity, wind, and more</p>
      </div>
    </div>
  )
}
