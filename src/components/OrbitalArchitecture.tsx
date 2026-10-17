import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** Locally generated studio reflections: no external environment or runtime CDN. */
export function ObservatoryLighting({
  economical,
  onReady,
  onUnavailable,
}: {
  economical: boolean
  onReady: () => void
  onUnavailable: () => void
}) {
  const { gl, scene, camera, size, invalidate } = useThree()
  const composer = useRef<EffectComposer | null>(null)
  const warmed = useRef(false)
  const reported = useRef(false)
  const revealFrame = useRef(0)
  useEffect(() => {
    const room = new THREE.Scene()
    room.background = new THREE.Color('#111b27')
    const cards: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = []
    const card = (
      position: [number, number, number],
      scale: [number, number, number],
      color: [number, number, number]
    ) => {
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide })
      )
      surface.position.set(...position)
      surface.scale.set(...scale)
      surface.lookAt(0, 0, 0)
      room.add(surface)
      cards.push(surface)
    }
    // Broad warm highlights, a cool edge strip, and a soft overhead reflection.
    card([-6, 7, 8], [6, 8, 1], [3.6, 3.1, 2.5])
    card([7, 1, 4], [1.4, 8, 1], [1.3, 2.4, 3.7])
    card([-2, 6, -7], [7, 2, 1], [1.5, 2.1, 3.1])
    card([0, -6, 4], [5, 4, 1], [0.25, 0.35, 0.5])
    const pmrem = new THREE.PMREMGenerator(gl)
    const environment = pmrem.fromScene(room, 0.04)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.8
    for (const surface of cards) {
      surface.geometry.dispose()
      surface.material.dispose()
    }
    pmrem.dispose()
    return () => {
      scene.environment = null
      environment.dispose()
    }
  }, [gl, scene])
  useEffect(() => {
    if (economical) return
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    const effects = new EffectComposer(gl, target)
    const render = new RenderPass(scene, camera)
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.6, 1.3)
    const output = new OutputPass()
    effects.addPass(render)
    effects.addPass(bloom)
    effects.addPass(output)
    composer.current = effects
    return () => {
      composer.current = null
      bloom.dispose()
      render.dispose()
      output.dispose()
      effects.dispose()
    }
  }, [gl, scene, camera, economical])
  useEffect(() => {
    composer.current?.setSize(size.width, size.height)
  }, [size, economical])
  useEffect(() => {
    let cancelled = false
    const context = gl.getContext()
    const parallel = context.getExtension('KHR_parallel_shader_compile')
    let frame = 0
    const waitForPrograms = () => {
      if (cancelled) return
      if (context.isContextLost()) {
        onUnavailable()
        return
      }
      if (
        parallel &&
        gl.info.programs?.some(
          (program) =>
            program.program &&
            !context.getProgramParameter(program.program, parallel.COMPLETION_STATUS_KHR)
        )
      ) {
        frame = requestAnimationFrame(waitForPrograms)
        return
      }
      warmed.current = true
      invalidate()
    }
    frame = requestAnimationFrame(() => {
      try {
        // Use cancellable completion polling so leaving for Directory cannot keep
        // querying programs after R3F disposes their renderer.
        gl.compile(scene, camera)
        waitForPrograms()
      } catch {
        if (!cancelled) onUnavailable()
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      cancelAnimationFrame(revealFrame.current)
    }
  }, [gl, scene, camera, invalidate, onUnavailable])
  useFrame(() => {
    if (!warmed.current) return
    if (composer.current) composer.current.render()
    else gl.render(scene, camera)
    if (!reported.current) {
      reported.current = true
      // Reveal only after a real frame, including postprocessing, has been submitted.
      revealFrame.current = requestAnimationFrame(onReady)
    }
  }, 1)
  return (
    <>
      <ambientLight intensity={0.09} color="#71869d" />
      <hemisphereLight args={['#a7c3da', '#080d16', 0.3]} />
      <directionalLight
        castShadow
        position={[-7, 9, 12]}
        intensity={2.3}
        color="#fff0d9"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={85}
        shadow-normalBias={0.035}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[8, -3, 3]} intensity={0.65} color="#8cbad5" />
      <directionalLight position={[-9, 4, -8]} intensity={1.6} color="#7faddc" />
      <pointLight position={[0, 0.5, 0]} intensity={25} color="#ffc270" decay={2} />
      <pointLight position={[-6, 3, 3]} intensity={18} color="#9ee9ef" decay={2} />
    </>
  )
}

export function StellarEngine({ paused }: { paused: boolean }) {
  const plasma = useRef<THREE.ShaderMaterial>(null)
  const corona = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ time: { value: 0 } }), [])
  useFrame((_, delta) => {
    if (!paused) uniforms.time.value += Math.min(delta, 0.05)
    for (const material of [plasma.current, corona.current]) {
      if (material) material.uniforms.time.value = uniforms.time.value
    }
  })
  return (
    <group position={[0, 0.25, -2]} scale={0.72}>
      <mesh userData={{ navigationSurface: true }}>
        <sphereGeometry args={[3.35, 96, 64]} />
        <shaderMaterial
          ref={plasma}
          uniforms={uniforms}
          vertexShader={`varying vec3 p,n,v;void main(){p=position;n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);v=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`}
          fragmentShader={`uniform float time;varying vec3 p,n,v;
          float h(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
          float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
          void main(){vec3 q=p*3.+vec3(time*.09,time*.055,sin(time*.07)*.5);float f=noise3(q)*.52+noise3(q*2.1)*.28+noise3(q*5.3)*.14+noise3(q*14.)*.06;
          float granules=pow(1.-abs(sin(f*20.)),4.);
          vec3 c=mix(vec3(.7,.11,.008),vec3(2.8,1.45,.46),smoothstep(.18,.78,f));
          c+=granules*vec3(.65,.32,.07);c*=1.+sin(time*.6)*.045;c*=.55+.45*max(dot(normalize(n),normalize(v)),0.);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`}
        />
      </mesh>
      <mesh raycast={() => {}}>
        <planeGeometry args={[21, 21]} />
        <shaderMaterial
          ref={corona}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`varying vec2 pos;void main(){pos=uv*2.-1.;vec4 center=modelViewMatrix*vec4(0,0,0,1);center.xy+=position.xy;gl_Position=projectionMatrix*center;}`}
          fragmentShader={`uniform float time;varying vec2 pos;
          void main(){float r=length(pos),a=atan(pos.y,pos.x);
          float rays=.5+.5*sin(a*13.+sin(a*7.+time*.24)*2.+time*.12);
          float wisps=.5+.5*sin(a*23.-time*.19+sin(r*18.-time*.5));
          float corona=exp(-max(0.,r-.3)*(14.-rays*4.))*smoothstep(.27,.34,r);
          float flare=pow(rays,5.)*exp(-abs(r-.37)*19.)*wisps;
          float glow=pow(max(0.,1.-r),3.)*.19;
          gl_FragColor=vec4(1.,.39+corona*.15,.09,(glow+corona*.36+flare*.18)*(1.-smoothstep(.7,1.,r)));}`}
        />
      </mesh>
    </group>
  )
}

export function DeepSpace({ radius }: { radius: number }) {
  return (
    <mesh raycast={() => {}}>
      <sphereGeometry args={[radius, 32, 24]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        vertexShader={`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`varying vec3 direction;
        float h(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
        float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){return n(p)*.52+n(p*2.03)*.26+n(p*4.1)*.13+n(p*8.3)*.065;}
        void main(){vec3 d=normalize(direction);vec3 q=d*4.5;
        float warp=fbm(q+vec3(3.,1.,7.));float f=fbm(q+warp*2.5);
        float band=exp(-pow((d.y+d.x*.42-.08)*2.7,2.));
        float filaments=smoothstep(.36,.73,f)*band;
        float dust=smoothstep(.42,.65,fbm(q*1.8+8.))*band;
        float veins=smoothstep(.5,.72,fbm(q*3.5+warp))*band;
        vec3 blue=vec3(.022,.075,.13), violet=vec3(.075,.035,.11);
        vec3 color=vec3(.002,.004,.009)+mix(blue,violet,smoothstep(-.7,.6,d.x))*filaments;
        color+=vec3(.15,.075,.025)*pow(f,3.)*exp(-length(d-vec3(-.5,.3,-.9))*2.5);
        color+=vec3(.035,.07,.09)*veins*.22;
        color*=.58*(1.-dust*.82);
        gl_FragColor=vec4(color,1.);}`}
      />
    </mesh>
  )
}
