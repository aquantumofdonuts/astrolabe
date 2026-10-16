import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/** Locally generated studio reflections: no external environment or runtime CDN. */
export function ObservatoryLighting({ economical }: { economical: boolean }) {
  const { gl, scene, camera, size } = useThree()
  const composer = useRef<EffectComposer | null>(null)
  useEffect(() => {
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(gl)
    const environment = pmrem.fromScene(room, 0.04)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.65
    room.dispose()
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
  useFrame(() => {
    if (composer.current) composer.current.render()
    else gl.render(scene, camera)
  }, 1)
  return (
    <>
      <ambientLight intensity={0.2} color="#71869d" />
      <directionalLight
        castShadow
        position={[-7, 9, 12]}
        intensity={2}
        color="#fff0cf"
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
      <directionalLight position={[8, -3, 3]} intensity={1.3} color="#77b6d0" />
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
    <group position={[0, 0.25, -2]}>
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
          float glow=pow(max(0.,1.-r),3.)*.25;
          gl_FragColor=vec4(1.,.37+corona*.15,.06,(glow+corona*.45+flare*.25)*(1.-smoothstep(.7,1.,r)));}`}
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
        vec3 blue=vec3(.025,.085,.14), violet=vec3(.10,.035,.115);
        vec3 color=vec3(.002,.004,.009)+mix(blue,violet,smoothstep(-.7,.6,d.x))*filaments;
        color+=vec3(.15,.075,.025)*pow(f,3.)*exp(-length(d-vec3(-.5,.3,-.9))*2.5);
        color*=.6*(1.-dust*.72);
        gl_FragColor=vec4(color,1.);}`}
      />
    </mesh>
  )
}
