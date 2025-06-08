"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { Vector2, ShaderMaterial, FloatType, NearestFilter } from "three"
import { Canvas, useFrame, useThree, createPortal } from "@react-three/fiber"
import { useFBO } from "@react-three/drei"
import { Download, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Vertex shader (shared by all passes)
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Fragment shader for the fluid simulation
const fluidFragmentShader = `
  uniform sampler2D uTexture;
  uniform sampler2D uVelocity;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform float uTime;
  uniform float uDecay;
  uniform float uDiffusion;
  uniform float uViscosity;
  uniform bool uIsMouseDown;
  uniform bool uIsHovering;
  uniform int uColorMode;
  
  varying vec2 vUv;

  // Simplex noise functions
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Curl noise for fluid motion
  vec2 curl(float x, float y) {
    float eps = 0.01;
    float n1 = snoise(vec2(x + eps, y));
    float n2 = snoise(vec2(x - eps, y));
    float n3 = snoise(vec2(x, y + eps));
    float n4 = snoise(vec2(x, y - eps));
    float dy = (n1 - n2) / (2.0 * eps);
    float dx = (n3 - n4) / (2.0 * eps);
    return vec2(dy, -dx);
  }

  // Color palettes
  vec3 palette(float t, int mode) {
    vec3 a, b, c, d;
    
    // Different color palettes
    if (mode == 0) { // Vibrant
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 1.0, 1.0);
      d = vec3(0.00, 0.33, 0.67);
    } else if (mode == 1) { // Earth tones
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 0.7, 0.4);
      d = vec3(0.00, 0.15, 0.20);
    } else if (mode == 2) { // Neon
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(2.0, 1.0, 0.0);
      d = vec3(0.50, 0.20, 0.25);
    } else { // Monochrome
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 1.0, 1.0);
      d = vec3(0.00, 0.10, 0.20);
    }
    
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    vec2 uv = vUv;
    vec2 texel = 1.0 / uResolution;
    
    // Get current state
    vec4 color = texture2D(uTexture, uv);
    vec2 velocity = texture2D(uVelocity, uv).xy;
    
    // Apply velocity-based advection
    vec2 pos = uv - velocity * texel * uViscosity;
    vec4 advectedColor = texture2D(uTexture, pos);
    
    // Diffusion
    vec4 sum = vec4(0.0);
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        sum += texture2D(uTexture, uv + vec2(i, j) * texel);
      }
    }
    vec4 diffusedColor = sum / 9.0;
    
    // Blend between advection and diffusion
    color = mix(advectedColor, diffusedColor, uDiffusion);
    
    // Apply decay
    color *= (1.0 - uDecay);
    
    // Mouse interaction
    vec2 mousePos = uMouse / uResolution;
    vec2 prevMousePos = uPrevMouse / uResolution;
    float mouseDistance = distance(uv, mousePos);
    float prevMouseDistance = distance(uv, prevMousePos);
    
    // Smudging and blending when mouse is down
    if (uIsMouseDown && mouseDistance < 0.1) {
      vec2 dir = normalize(mousePos - prevMousePos);
      float strength = smoothstep(0.1, 0.0, mouseDistance) * 0.2;
      
      // Create smudge effect along mouse movement direction
      vec2 smudgePos = uv - dir * strength;
      vec4 smudgedColor = texture2D(uTexture, smudgePos);
      
      // Add new color based on time and position
      float t = uTime * 0.1 + mouseDistance * 5.0;
      vec3 newColor = palette(t, uColorMode);
      
      // Blend existing color with new color
      color = mix(color, vec4(newColor, 1.0), strength * 2.0);
      color = mix(color, smudgedColor, strength * 3.0);
    }
    
    // Hover effects - subtle radial waves
    if (uIsHovering && !uIsMouseDown && mouseDistance < 0.15) {
      float waveStrength = smoothstep(0.15, 0.0, mouseDistance) * 0.05;
      float wave = sin(mouseDistance * 50.0 - uTime * 5.0) * waveStrength;
      
      // Create chromatic lensing effect
      vec2 offset = normalize(uv - mousePos) * wave;
      vec4 r = texture2D(uTexture, uv + offset * 1.0);
      vec4 g = texture2D(uTexture, uv + offset * 1.5);
      vec4 b = texture2D(uTexture, uv + offset * 2.0);
      
      vec4 lensedColor = vec4(r.r, g.g, b.b, 1.0);
      color = mix(color, lensedColor, waveStrength * 10.0);
    }
    
    // Ambient motion using curl noise
    vec2 curlVel = curl(uv.x * 3.0 + uTime * 0.1, uv.y * 3.0 + uTime * 0.1) * 0.0005;
    color += vec4(curlVel.x, curlVel.y, -curlVel.x, 0.0) * 0.05;
    
    // Time-based color evolution
    float evolutionSpeed = 0.05;
    float t = uTime * evolutionSpeed;
    vec3 timeColor = palette(t + uv.x * 0.2 + uv.y * 0.3, uColorMode);
    color = mix(color, vec4(timeColor, 1.0), 0.001);
    
    gl_FragColor = color;
  }
`

// Fragment shader for velocity field
const velocityFragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform float uTime;
  uniform bool uIsMouseDown;
  uniform bool uIsHovering;
  
  varying vec2 vUv;

  // Simplex noise functions
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Curl noise
  vec2 curl(float x, float y) {
    float eps = 0.01;
    float n1 = snoise(vec2(x + eps, y));
    float n2 = snoise(vec2(x - eps, y));
    float n3 = snoise(vec2(x, y + eps));
    float n4 = snoise(vec2(x, y - eps));
    float dy = (n1 - n2) / (2.0 * eps);
    float dx = (n3 - n4) / (2.0 * eps);
    return vec2(dy, -dx);
  }

  void main() {
    vec2 uv = vUv;
    vec2 texel = 1.0 / uResolution;
    
    // Get current velocity
    vec2 velocity = texture2D(uTexture, uv).xy;
    
    // Apply decay
    velocity *= 0.98;
    
    // Mouse interaction
    vec2 mousePos = uMouse / uResolution;
    vec2 prevMousePos = uPrevMouse / uResolution;
    vec2 mouseVelocity = (mousePos - prevMousePos) * 10.0;
    float mouseDistance = distance(uv, mousePos);
    
    // Add velocity when mouse is down (smudging)
    if (uIsMouseDown && mouseDistance < 0.1) {
      float strength = smoothstep(0.1, 0.0, mouseDistance);
      velocity += mouseVelocity * strength;
    }
    
    // Add subtle velocity when hovering
    if (uIsHovering && !uIsMouseDown && mouseDistance < 0.15) {
      float strength = smoothstep(0.15, 0.0, mouseDistance) * 0.2;
      vec2 dir = normalize(uv - mousePos);
      velocity += dir * strength;
    }
    
    // Add ambient curl noise
    vec2 curlVel = curl(uv.x * 3.0 + uTime * 0.1, uv.y * 3.0 + uTime * 0.1) * 0.01;
    velocity += curlVel;
    
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`

// Fragment shader for display
const displayFragmentShader = `
  uniform sampler2D uTexture;
  uniform sampler2D uVelocity;
  uniform float uTime;
  uniform int uColorMode;
  
  varying vec2 vUv;
  
  // Color palettes
  vec3 palette(float t, int mode) {
    vec3 a, b, c, d;
    
    // Different color palettes
    if (mode == 0) { // Vibrant
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 1.0, 1.0);
      d = vec3(0.00, 0.33, 0.67);
    } else if (mode == 1) { // Earth tones
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 0.7, 0.4);
      d = vec3(0.00, 0.15, 0.20);
    } else if (mode == 2) { // Neon
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(2.0, 1.0, 0.0);
      d = vec3(0.50, 0.20, 0.25);
    } else { // Monochrome
      a = vec3(0.5, 0.5, 0.5);
      b = vec3(0.5, 0.5, 0.5);
      c = vec3(1.0, 1.0, 1.0);
      d = vec3(0.00, 0.10, 0.20);
    }
    
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    vec4 color = texture2D(uTexture, vUv);
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    
    // Enhance colors based on velocity
    float speed = length(velocity) * 10.0;
    vec3 speedColor = palette(speed + uTime * 0.1, uColorMode);
    
    // Blend fluid color with velocity-based color
    color.rgb = mix(color.rgb, speedColor, 0.1);
    
    // Apply gamma correction
    color.rgb = pow(color.rgb, vec3(0.8));
    
    gl_FragColor = color;
  }
`

// Main fluid simulation component
function FluidSimulation({ colorMode = 0 }) {
  const { size, viewport } = useThree()
  const mouse = useRef(new Vector2(0, 0))
  const prevMouse = useRef(new Vector2(0, 0))
  const isMouseDown = useRef(false)
  const isHovering = useRef(false)

  // Create render targets for ping-pong rendering
  const fluidFBO1 = useFBO({ type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter })
  const fluidFBO2 = useFBO({ type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter })
  const velocityFBO1 = useFBO({ type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter })
  const velocityFBO2 = useFBO({ type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter })

  // Track which FBOs are active
  const [fluidFBO, setFluidFBO] = useState({ read: fluidFBO1, write: fluidFBO2 })
  const [velocityFBO, setVelocityFBO] = useState({ read: velocityFBO1, write: velocityFBO2 })

  // Create materials
  const fluidMaterial = useRef(
    new ShaderMaterial({
      vertexShader,
      fragmentShader: fluidFragmentShader,
      uniforms: {
        uTexture: { value: null },
        uVelocity: { value: null },
        uResolution: { value: new Vector2(size.width, size.height) },
        uMouse: { value: mouse.current },
        uPrevMouse: { value: prevMouse.current },
        uTime: { value: 0 },
        uDecay: { value: 0.002 },
        uDiffusion: { value: 0.1 },
        uViscosity: { value: 0.5 },
        uIsMouseDown: { value: false },
        uIsHovering: { value: false },
        uColorMode: { value: colorMode },
      },
    }),
  )

  const velocityMaterial = useRef(
    new ShaderMaterial({
      vertexShader,
      fragmentShader: velocityFragmentShader,
      uniforms: {
        uTexture: { value: null },
        uResolution: { value: new Vector2(size.width, size.height) },
        uMouse: { value: mouse.current },
        uPrevMouse: { value: prevMouse.current },
        uTime: { value: 0 },
        uIsMouseDown: { value: false },
        uIsHovering: { value: false },
      },
    }),
  )

  const displayMaterial = useRef(
    new ShaderMaterial({
      vertexShader,
      fragmentShader: displayFragmentShader,
      uniforms: {
        uTexture: { value: null },
        uVelocity: { value: null },
        uTime: { value: 0 },
        uColorMode: { value: colorMode },
      },
    }),
  )

  // Update uniforms when color mode changes
  useEffect(() => {
    fluidMaterial.current.uniforms.uColorMode.value = colorMode
    displayMaterial.current.uniforms.uColorMode.value = colorMode
  }, [colorMode])

  // Handle mouse/touch events
  useEffect(() => {
    const handleMouseMove = (e) => {
      prevMouse.current.copy(mouse.current)

      // Convert screen coordinates to normalized device coordinates
      const x = e.clientX
      const y = e.clientY
      mouse.current.set(x, size.height - y)

      isHovering.current = true
    }

    const handleMouseDown = () => {
      isMouseDown.current = true
    }

    const handleMouseUp = () => {
      isMouseDown.current = false
    }

    const handleMouseLeave = () => {
      isHovering.current = false
    }

    // Add event listeners
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault()
        handleMouseMove({
          clientX: e.touches[0].clientX,
          clientY: e.touches[0].clientY,
        })
      },
      { passive: false },
    )
    window.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("touchstart", handleMouseDown, { passive: false })
    window.addEventListener("mouseup", handleMouseUp)
    window.addEventListener("touchend", handleMouseUp)
    window.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      // Remove event listeners
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("touchmove", handleMouseMove)
      window.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("touchstart", handleMouseDown)
      window.removeEventListener("mouseup", handleMouseUp)
      window.removeEventListener("touchend", handleMouseUp)
      window.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [size.height])

  // Animation loop
  useFrame((state) => {
    const { gl, clock } = state

    // Update uniforms
    fluidMaterial.current.uniforms.uTexture.value = fluidFBO.read.texture
    fluidMaterial.current.uniforms.uVelocity.value = velocityFBO.read.texture
    fluidMaterial.current.uniforms.uTime.value = clock.elapsedTime
    fluidMaterial.current.uniforms.uMouse.value = mouse.current
    fluidMaterial.current.uniforms.uPrevMouse.value = prevMouse.current
    fluidMaterial.current.uniforms.uIsMouseDown.value = isMouseDown.current
    fluidMaterial.current.uniforms.uIsHovering.value = isHovering.current

    velocityMaterial.current.uniforms.uTexture.value = velocityFBO.read.texture
    velocityMaterial.current.uniforms.uTime.value = clock.elapsedTime
    velocityMaterial.current.uniforms.uMouse.value = mouse.current
    velocityMaterial.current.uniforms.uPrevMouse.value = prevMouse.current
    velocityMaterial.current.uniforms.uIsMouseDown.value = isMouseDown.current
    velocityMaterial.current.uniforms.uIsHovering.value = isHovering.current

    displayMaterial.current.uniforms.uTexture.value = fluidFBO.read.texture
    displayMaterial.current.uniforms.uVelocity.value = velocityFBO.read.texture
    displayMaterial.current.uniforms.uTime.value = clock.elapsedTime

    // Update velocity field
    gl.setRenderTarget(velocityFBO.write)
    gl.render(state.scene, state.camera)

    // Update fluid simulation
    gl.setRenderTarget(fluidFBO.write)
    gl.render(state.scene, state.camera)

    // Swap buffers
    setFluidFBO((prev) => ({ read: prev.write, write: prev.read }))
    setVelocityFBO((prev) => ({ read: prev.write, write: prev.read }))

    // Render to screen
    gl.setRenderTarget(null)
  })

  return (
    <>
      {/* Velocity pass */}
      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <primitive object={velocityMaterial.current} attach="material" />
        </mesh>,
        velocityFBO.write,
      )}

      {/* Fluid simulation pass */}
      {createPortal(
        <mesh>
          <planeGeometry args={[2, 2]} />
          <primitive object={fluidMaterial.current} attach="material" />
        </mesh>,
        fluidFBO.write,
      )}

      {/* Display pass */}
      <mesh>
        <planeGeometry args={[2, 2]} />
        <primitive object={displayMaterial.current} attach="material" />
      </mesh>
    </>
  )
}

// Main component
export default function FluidArt() {
  const [colorMode, setColorMode] = useState(0)
  const canvasRef = useRef(null)

  // Function to save the canvas as an image
  const saveAsImage = useCallback(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current.querySelector("canvas")
      if (canvas) {
        const link = document.createElement("a")
        link.download = "fluid-art.png"
        link.href = canvas.toDataURL("image/png")
        link.click()
      }
    }
  }, [])

  // Function to reset the canvas
  const resetCanvas = useCallback(() => {
    // Force a remount of the Canvas component
    setColorMode((prev) => prev)
  }, [])

  return (
    <div className="relative w-full h-screen" ref={canvasRef}>
      <Canvas>
        <FluidSimulation colorMode={colorMode} />
      </Canvas>

      {/* UI Controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="bg-white/10 backdrop-blur-sm border-white/20">
              <Palette className="h-5 w-5" />
              <span className="sr-only">Color palette</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" side="bottom" align="end">
            <Tabs defaultValue="vibrant" className="w-full">
              <TabsList className="grid grid-cols-4 mb-2">
                <TabsTrigger value="vibrant" onClick={() => setColorMode(0)}>
                  Vibrant
                </TabsTrigger>
                <TabsTrigger value="earth" onClick={() => setColorMode(1)}>
                  Earth
                </TabsTrigger>
                <TabsTrigger value="neon" onClick={() => setColorMode(2)}>
                  Neon
                </TabsTrigger>
                <TabsTrigger value="mono" onClick={() => setColorMode(3)}>
                  Mono
                </TabsTrigger>
              </TabsList>
              <div className="flex justify-between mt-2">
                <Button variant="outline" size="sm" onClick={resetCanvas}>
                  Reset
                </Button>
              </div>
            </Tabs>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="icon"
          className="bg-white/10 backdrop-blur-sm border-white/20"
          onClick={saveAsImage}
        >
          <Download className="h-5 w-5" />
          <span className="sr-only">Save as image</span>
        </Button>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 text-sm text-white/70 bg-black/20 backdrop-blur-sm p-2 rounded-md max-w-xs">
        <p>Click and drag to smudge colors</p>
        <p>Hover to create subtle waves</p>
        <p>Use the palette button to change colors</p>
      </div>
    </div>
  )
}
