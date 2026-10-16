import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Point3 } from '../lib/orbits'

const surface = { navigationSurface: true }
const noise = `
float hash(vec3 p) { p=fract(p*.3183099+vec3(.1,.2,.3)); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float f=0., a=.53;
  for(int i=0;i<5;i++){ f+=a*noise3(p); p=p*2.03+vec3(9.1,2.7,4.3); a*=.49; }
  return f;
}`
const vertex = `
varying vec3 vLocal, vWorld, vNormal;
varying vec2 vUv;
void main(){
  vUv=uv;
  vLocal=position; vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*world;
}`
const planetFragment = `
uniform vec3 ocean, land, highland, atmosphere;
uniform float seed, kind, time, imageMode;
uniform sampler2D imageMap;
varying vec2 vUv;
varying vec3 vLocal, vWorld, vNormal;
${noise}
void main(){
  vec3 p=normalize(vLocal), q=p*3.7+vec3(seed);
  float terrain=fbm(q+fbm(q*1.9)*.65);
  float detail=fbm(q*14.);
  float continent=smoothstep(.48,.535,terrain);
  float clouds=smoothstep(.57,.72,fbm(p*6.+vec3(time*.012,seed,0.)));
  vec3 albedo=mix(ocean, mix(land,highland,smoothstep(.54,.71,terrain)),continent);
  albedo*=.78+detail*.45;
  float ice=smoothstep(.79,.96,abs(p.y)+(terrain-.5)*.4);
  albedo=mix(albedo,vec3(.68,.8,.84),ice);
  float emissive=0.;
  if(kind>1.5){
    float bands=.5+sin(p.y*23.+fbm(q*1.7)*6.)*.24+sin(p.y*65.+fbm(q*2.)*3.)*.12;
    float streak=fbm(vec3(p.x*8.,p.y*70.,p.z*8.)+seed);
    albedo=mix(ocean,land,smoothstep(.12,.85,bands))*(.72+streak*.48);
    albedo=mix(albedo,highland,smoothstep(.66,.84,bands)*.25);
    clouds=0.; continent=0.;
  }else if(kind>.5){
    float ridges=pow(1.-abs(sin(terrain*36.+detail*1.5)),9.);
    albedo=mix(ocean,land,smoothstep(.3,.72,terrain))*(.65+detail*.7);
    albedo=mix(albedo,highland,ridges*.6);
    emissive=ridges*smoothstep(.59,.72,terrain)*.5;
    clouds*=.12;
  }
  if(imageMode>.5){
    // Two hemispheres keep a complete icon discoverable from either side of the globe.
    albedo=texture2D(imageMap,vec2(fract(vUv.x*2.),vUv.y)).rgb;
    clouds=0.; continent=1.; emissive=0.;
  }
  // Raking illumination and a restrained fill preserve the terminator and surface relief.
  vec3 n=normalize(vNormal), light=normalize(vec3(-.55,.55,.75));
  vec3 view=normalize(cameraPosition-vWorld);
  float day=max(dot(n,light),0.);
  float night=1.-smoothstep(-.15,.25,dot(n,light));
  float rim=pow(1.-max(dot(n,view),0.),3.8);
  float spec=pow(max(dot(reflect(-light,n),view),0.),45.)*(1.-continent)*(kind>1.5?.025:.28);
  vec3 color=albedo*((imageMode>.5?.2:.075)+day*1.28)+vec3(.7,.85,1.)*spec;
  color=mix(color,vec3(.86,.89,.88)*(.16+day*.94),clouds*.86);
  float cities=step(.84,noise3(p*190.))*smoothstep(.53,.65,fbm(p*20.+seed))*continent;
  float sparkle=.55+.45*pow(.5+.5*sin(time*1.7+noise3(p*190.)*53.),4.);
  if(kind<.5 || imageMode>.5) color+=cities*night*vec3(1.,.7,.32)*sparkle*(imageMode>.5?1.5:.7);
  color+=highland*emissive+atmosphere*rim*(.18+day*.4);
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
const atmosphereFragment = `
uniform vec3 tint;
varying vec3 vLocal,vWorld,vNormal;
void main(){
  vec3 n=normalize(vNormal), view=normalize(cameraPosition-vWorld);
  float facing=max(dot(n,view),0.);
  float edge=pow(1.-facing,3.)*smoothstep(0.,.25,facing);
  float light=.35+.65*max(dot(n,normalize(vec3(-.55,.55,.75))),0.);
  gl_FragColor=vec4(tint,edge*light*.44);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
const palettes = [
  ['#103d63', '#5c7966', '#c8b58c', '#6db9e0'],
  ['#38221e', '#9b6144', '#edac68', '#d8a77d'],
  ['#243d54', '#7298a7', '#c4d6cf', '#8fcada'],
  ['#323749', '#827a9b', '#c4acb4', '#b7a5e2'],
  ['#214b53', '#769b8c', '#d2c3a0', '#9ad0ba'],
]

function Planet({
  family,
  variant,
  paused,
  image,
}: {
  family: number
  variant: number
  paused: boolean
  image?: string
}) {
  const { invalidate } = useThree()
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    setTexture(null)
    if (!image) return
    let cancelled = false
    const loaded = new THREE.TextureLoader().load(
      image,
      (map) => {
        if (cancelled) return
        if (map.image.width > 512 || map.image.height > 512) {
          map.dispose()
          return
        }
        map.colorSpace = THREE.SRGBColorSpace
        map.anisotropy = 4
        map.needsUpdate = true
        setTexture(map)
        invalidate()
      },
      undefined,
      () => {
        if (!cancelled) invalidate()
      }
    )
    return () => {
      cancelled = true
      loaded.dispose()
    }
  }, [image, invalidate])
  const globe = useRef<THREE.Group>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const palette = palettes[family % palettes.length]
  const gas = !image && variant % 3 === 2 && family % 2 === 1
  const uniforms = useMemo(
    () => ({
      ocean: {
        value: new THREE.Color(gas ? (family % 5 === 1 ? '#8d7059' : '#555769') : palette[0]),
      },
      land: {
        value: new THREE.Color(gas ? (family % 5 === 1 ? '#c4a77d' : '#9695b0') : palette[1]),
      },
      highland: {
        value: new THREE.Color(gas ? (family % 5 === 1 ? '#e6ccb0' : '#c3b6cb') : palette[2]),
      },
      atmosphere: { value: new THREE.Color(palette[3]) },
      seed: { value: family * 8.71 + variant * 5.39 },
      kind: { value: gas ? 2 : family === 1 || (family === 2 && variant === 2) ? 1 : 0 },
      time: { value: 0 },
      imageMap: { value: texture },
      imageMode: { value: texture ? 1 : 0 },
    }),
    [family, variant, palette, gas, texture]
  )
  const haze = useMemo(() => ({ tint: { value: new THREE.Color(palette[3]) } }), [palette])
  useFrame((_, dt) => {
    if (paused) return
    uniforms.time.value += Math.min(dt, 0.05)
    if (material.current) material.current.uniforms.time.value = uniforms.time.value
    if (globe.current) globe.current.rotation.y += Math.min(dt, 0.05) * 0.025
  })
  return (
    <group>
      <group ref={globe} rotation={image ? [0, 0, 0] : [0.12, variant * 1.7 + family, 0.08]}>
        <mesh userData={surface}>
          <sphereGeometry args={[1.02, 80, 56]} />
          <shaderMaterial
            ref={material}
            vertexShader={vertex}
            fragmentShader={planetFragment}
            uniforms={uniforms}
          />
        </mesh>
        <mesh scale={1.045} raycast={() => {}}>
          <sphereGeometry args={[1.02, 64, 48]} />
          <shaderMaterial
            vertexShader={vertex}
            fragmentShader={atmosphereFragment}
            uniforms={haze}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      {gas && <PlanetaryRings tint={palette[2]} />}
    </group>
  )
}

function PlanetaryRings({ tint }: { tint: string }) {
  const uniforms = useMemo(() => ({ tint: { value: new THREE.Color(tint) } }), [tint])
  return (
    <mesh rotation={[1.08, 0.22, -0.3]} userData={surface}>
      <ringGeometry args={[1.27, 1.92, 160]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertex}
        side={THREE.DoubleSide}
        transparent
        depthWrite={false}
        fragmentShader={`uniform vec3 tint; varying vec3 vLocal,vWorld,vNormal; ${noise}
        void main(){float r=length(vLocal.xy);float grain=noise3(vec3(r*180.,0.,0.));
        float density=.3+grain*.5; density*=.15+.85*smoothstep(.008,.024,abs(r-1.58));
        density*=smoothstep(1.27,1.33,r)*(1.-smoothstep(1.84,1.92,r));
        float shadow=smoothstep(-.12,.2,vLocal.x+abs(vLocal.y)*.7);
        gl_FragColor=vec4(tint*(.3+shadow*.65),density);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`}
      />
    </mesh>
  )
}

function Habitat({ family, color, paused }: { family: number; color: string; paused: boolean }) {
  const rotor = useRef<THREE.Group>(null)
  const windows = useRef<THREE.InstancedMesh>(null)
  const panelMap = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = '#cad2d4'
    context.fillRect(0, 0, 1024, 128)
    for (let column = 0; column < 32; column++) {
      for (let row = 0; row < 4; row++) {
        const x = column * 32,
          y = row * 32
        context.fillStyle = (column + row) % 3 === 0 ? '#80969f' : '#acb9be'
        context.fillRect(x + 1, y + 1, 30, 30)
        context.fillStyle = '#263d49'
        context.fillRect(x + 4, y + 24, 24, 3)
        context.fillStyle = '#d8e1de'
        context.fillRect(x + 4, y + 5, 8, 1)
      }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }, [])
  useEffect(() => () => panelMap.dispose(), [panelMap])
  const { hull, spine } = useMemo(() => {
    const profile = [
      [0.1, -0.85],
      [0.19, -0.78],
      [0.19, -0.55],
      [0.28, -0.5],
      [0.28, -0.4],
      [0.21, -0.35],
      [0.21, 0.35],
      [0.28, 0.4],
      [0.28, 0.5],
      [0.19, 0.55],
      [0.19, 0.78],
      [0.1, 0.85],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    return {
      hull: new THREE.TorusGeometry(1.08, 0.13, 16, 128),
      spine: new THREE.LatheGeometry(profile, 64),
    }
  }, [])
  useEffect(
    () => () => {
      hull.dispose()
      spine.dispose()
    },
    [hull, spine]
  )
  useEffect(() => {
    if (!windows.current) return
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 96; i++) {
      const angle = ((i % 48) / 48) * Math.PI * 2
      dummy.position.set(Math.cos(angle) * 1.215, Math.sin(angle) * 1.215, i < 48 ? -0.045 : 0.045)
      dummy.rotation.set(0, 0, angle)
      dummy.updateMatrix()
      windows.current.setMatrixAt(i, dummy.matrix)
    }
    windows.current.instanceMatrix.needsUpdate = true
  }, [])
  useFrame((_, dt) => {
    if (!paused && rotor.current) rotor.current.rotation.z += Math.min(dt, 0.05) * 0.035
  })
  return (
    <group rotation={[0.42 + family * 0.07, -0.38, -0.25 + family * 0.15]}>
      <mesh geometry={spine} rotation={[Math.PI / 2, 0, 0]} userData={surface}>
        <meshStandardMaterial color="#71818b" metalness={0.65} roughness={0.48} />
      </mesh>
      <group ref={rotor}>
        <mesh geometry={hull} userData={surface}>
          <meshStandardMaterial color="#637780" metalness={0.65} roughness={0.48} map={panelMap} />
        </mesh>
        {[-0.15, 0.15].map((z) => (
          <mesh key={z} position={[0, 0, z]} userData={surface}>
            <torusGeometry args={[1.08, 0.035, 8, 128]} />
            <meshStandardMaterial color="#8f9e9e" metalness={0.65} roughness={0.4} />
          </mesh>
        ))}
        <mesh>
          <torusGeometry args={[0.95, 0.025, 8, 96]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
        {Array.from({ length: 3 + (family % 3) }, (_, i) => {
          const a = (i / (3 + (family % 3))) * Math.PI * 2
          return (
            <group key={i} rotation={[0, 0, a]}>
              <mesh position={[0.61, 0, 0]} rotation={[0, 0, Math.PI / 2]} userData={surface}>
                <cylinderGeometry args={[0.045, 0.075, 0.87, 12]} />
                <meshStandardMaterial color="#5e737e" metalness={0.65} roughness={0.45} />
              </mesh>
              <mesh position={[0.71, 0.035, 0.045]}>
                <boxGeometry args={[0.5, 0.012, 0.014]} />
                <meshBasicMaterial color={color} />
              </mesh>
            </group>
          )
        })}
        <instancedMesh ref={windows} args={[undefined, undefined, 96]}>
          <boxGeometry args={[0.012, 0.035, 0.018]} />
          <meshStandardMaterial color="#f2dfba" emissive="#ffce8b" emissiveIntensity={1.6} />
        </instancedMesh>
      </group>
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3 + 0.4]}>
          <group position={[1.05, 0, -0.12]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} userData={surface}>
              <cylinderGeometry args={[0.12, 0.18, 0.52, 24]} />
              <meshStandardMaterial color="#81929a" metalness={0.6} roughness={0.48} />
            </mesh>
            <mesh position={[0, 0, 0.28]} userData={surface}>
              <torusGeometry args={[0.11, 0.025, 8, 32]} />
              <meshStandardMaterial color="#ced6d3" metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0, 0.29]}>
              <circleGeometry args={[0.085, 24]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * 0.68]}>
          <mesh userData={surface}>
            <torusGeometry args={[0.22, 0.04, 8, 48]} />
            <meshStandardMaterial color="#546774" metalness={0.8} roughness={0.26} />
          </mesh>
          <mesh position={[0, 0, side * 0.015]}>
            <circleGeometry args={[0.15, 40]} />
            <meshStandardMaterial
              color="#08151f"
              emissive={color}
              emissiveIntensity={0.5}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default function CelestialDestination({
  position,
  rotation,
  scale,
  family,
  variant,
  color,
  paused,
  hovered,
  id,
  onSelect,
  image,
}: {
  image?: string
  position: Point3
  rotation: Point3
  scale: number
  family: number
  variant: number
  color: string
  paused: boolean
  hovered: React.RefObject<string | null>
  id: string
  onSelect: () => void
}) {
  const { invalidate } = useThree()
  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation()
        if (event.delta < 5) onSelect()
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        hovered.current = id
        invalidate()
      }}
      onPointerOut={() => {
        if (hovered.current === id) hovered.current = null
        invalidate()
      }}
    >
      {!image && variant % 3 === 1 ? (
        <Habitat family={family} color={color} paused={paused} />
      ) : (
        <Planet family={family} variant={variant} paused={paused} image={image} />
      )}
    </group>
  )
}
