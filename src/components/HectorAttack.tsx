import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Catalog } from '../lib/catalog'
import type { Constellation } from '../lib/orbits'
import { destinationRadius } from '../lib/hud'
import { overviewPose, systemOverview } from '../lib/overview'
import { HECTOR_ARRIVAL, HECTOR_DEPARTURE, hectorPlan, hectorSeed } from '../lib/hector'
import type { HectorStatus } from '../lib/hector'
import HectorShip from './HectorShip'

const noHit = () => {}
const up = new THREE.Vector3(0, 1, 0)
const smooth = (t: number) => {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}
type Target = { id: string; name: string; position: THREE.Vector3; radius: number }
type Shot = ReturnType<typeof hectorPlan>['shots'][number] & { target: Target }

function Impact({
  target,
  time,
  impactAt,
  camera,
}: {
  target: Target
  time: RefObject<number>
  impactAt: number
  camera: THREE.Camera
}) {
  const root = useRef<THREE.Group>(null)
  const fire = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const fragments = useRef<THREE.InstancedMesh>(null)
  const sparks = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { age: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: `varying vec2 p;void main(){p=uv*2.-1.;vec4 c=modelViewMatrix*vec4(0.,0.,0.,1.);vec2 extent=vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));c.xy+=position.xy*extent;gl_Position=projectionMatrix*c;}`,
        fragmentShader: `varying vec2 p;uniform float age;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){float r=length(p);float cloud=n(p*7.+age*.8)*.55+n(p*14.-age)*.3;
      float edge=1.-smoothstep(.4,.95,r+cloud*.18);
      float heat=exp(-r*r*6.)*(1.-smoothstep(.05,.8,age));
      vec3 ember=mix(vec3(.28,.025,.006),vec3(2.7,.55,.025),cloud);
      vec3 flame=mix(ember,vec3(4.,2.8,1.2),heat);
      float fade=1.-smoothstep(.25,1.45,age);
      gl_FragColor=vec4(flame,edge*fade*.86);}`,
      }),
    []
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(() => {
    if (!root.current) return
    const t = time.current - impactAt
    root.current.visible = t >= 0 && t < 2.2
    if (!root.current.visible) return
    material.uniforms.age.value = t
    fire.current!.scale.setScalar(target.radius * (1.35 + t * 1.1))
    ring.current!.quaternion.copy(camera.quaternion)
    ring.current!.scale.setScalar(target.radius * (0.8 + t * 4.8))
    ;(ring.current!.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t / 1.2) * 0.6
    for (let i = 0; i < 28; i++) {
      const seed = hectorSeed(`${target.id}:${i}`)
      const angle = i * 2.39996 + seed * 6
      const direction = new THREE.Vector3(
        Math.cos(angle),
        Math.sin(angle),
        Math.sin(i * 3.7 + seed) * 0.7
      ).normalize()
      dummy.position.copy(direction).multiplyScalar(target.radius * (0.25 + t * (2 + seed * 3)))
      dummy.rotation.set(t * (2 + seed * 5), angle + t * 3, t * 4)
      dummy.scale.setScalar(target.radius * (0.035 + seed * 0.05) * Math.max(0, 1 - t / 2.2))
      dummy.updateMatrix()
      if (i < 18) fragments.current!.setMatrixAt(i, dummy.matrix)
      dummy.scale.multiplyScalar(0.48)
      dummy.updateMatrix()
      sparks.current!.setMatrixAt(i, dummy.matrix)
      color.setRGB(3.8 * (1 - t / 2.2), (0.6 + seed * 0.5) * (1 - t / 2.2), 0.03)
      sparks.current!.setColorAt(i, color)
    }
    fragments.current!.instanceMatrix.needsUpdate = true
    sparks.current!.instanceMatrix.needsUpdate = true
    if (sparks.current!.instanceColor) sparks.current!.instanceColor.needsUpdate = true
  })
  return (
    <group ref={root} position={target.position} visible={false}>
      <mesh ref={fire} material={material} raycast={noHit}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh ref={ring} raycast={noHit}>
        <ringGeometry args={[0.94, 1, 64]} />
        <meshBasicMaterial
          color={[3, 0.7, 0.08]}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <instancedMesh
        ref={fragments}
        args={[undefined, undefined, 18]}
        frustumCulled={false}
        raycast={noHit}
      >
        <boxGeometry args={[1, 0.45, 0.35]} />
        <meshStandardMaterial color="#8c9297" metalness={0.8} roughness={0.38} />
      </instancedMesh>
      <instancedMesh
        ref={sparks}
        args={[undefined, undefined, 28]}
        frustumCulled={false}
        raycast={noHit}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function Ordnance({
  shot,
  time,
  origin,
  right,
  upward,
  scale,
  reducedMotion,
}: {
  shot: Shot
  time: RefObject<number>
  origin: (t: number) => THREE.Vector3
  right: THREE.Vector3
  upward: THREE.Vector3
  scale: number
  reducedMotion: boolean
}) {
  const { camera } = useThree()
  const laser = useRef<THREE.Group>(null)
  const missile = useRef<THREE.Group>(null)
  const trail = useRef<THREE.Points>(null)
  const trailGeometry = useMemo(
    () =>
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(new Float32Array(36), 3)
      ),
    []
  )
  useEffect(() => () => trailGeometry.dispose(), [trailGeometry])
  const seed = hectorSeed(shot.id)
  const muzzle = (at: number) => {
    const center = origin(at)
    const direction = shot.target.position.clone().sub(center)
    const forward = right
      .clone()
      .multiplyScalar(direction.dot(right))
      .addScaledVector(upward, direction.dot(upward))
      .normalize()
    return center.addScaledVector(forward, scale * 1.8)
  }
  useFrame(() => {
    const t = time.current
    const traveling = t >= shot.launchAt && t < shot.impactAt
    const finalBurst = t >= shot.impactAt - 0.15 && t < shot.impactAt + 0.045
    const laserVisible =
      shot.weapon === 'laser' &&
      (reducedMotion
        ? t >= shot.impactAt - 0.4 && t < shot.impactAt
        : finalBurst ||
          (traveling &&
            (t - shot.launchAt < 0.09 || (t - shot.launchAt > 0.23 && t - shot.launchAt < 0.32))))
    laser.current!.visible = laserVisible
    missile.current!.visible = traveling && shot.weapon === 'missile'
    trail.current!.visible = missile.current!.visible
    if (laserVisible) {
      const start = muzzle(t)
      const direction = shot.target.position.clone().sub(start)
      laser.current!.position.copy(start).add(shot.target.position).multiplyScalar(0.5)
      laser.current!.quaternion.setFromUnitVectors(up, direction.clone().normalize())
      laser.current!.scale.set(1, direction.length(), 1)
    }
    if (missile.current!.visible) {
      const start = muzzle(shot.launchAt)
      const u = THREE.MathUtils.clamp((t - shot.launchAt) / (shot.impactAt - shot.launchAt), 0, 1)
      const path = (fraction: number) =>
        start
          .clone()
          .lerp(shot.target.position, fraction)
          .addScaledVector(right, Math.sin(fraction * Math.PI) * scale * (seed - 0.5) * 7)
          .addScaledVector(upward, Math.sin(fraction * Math.PI) * scale * (1 + seed * 2))
      const point = path(u)
      missile.current!.position.copy(point)
      missile.current!.quaternion.setFromUnitVectors(
        up,
        path(Math.min(1, u + 0.02))
          .sub(point)
          .normalize()
      )
      const positions = trailGeometry.attributes.position
      for (let i = 0; i < 12; i++) {
        const p = path(Math.max(0, u - i * 0.025))
        positions.setXYZ(i, p.x, p.y, p.z)
      }
      positions.needsUpdate = true
    }
  })
  return (
    <>
      <group ref={laser} visible={false}>
        <mesh raycast={noHit}>
          <cylinderGeometry args={[0.026, 0.026, 1, 6]} />
          <meshBasicMaterial color={[4, 1.9, 0.7]} toneMapped={false} depthWrite={false} />
        </mesh>
        <mesh raycast={noHit}>
          <cylinderGeometry args={[0.1, 0.1, 1, 8]} />
          <meshBasicMaterial
            color={[4, 0.12, 0.02]}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={missile} visible={false} scale={scale * 0.65}>
        <mesh raycast={noHit}>
          <cylinderGeometry args={[0.095, 0.095, 0.55, 8]} />
          <meshStandardMaterial color="#d2c6ab" metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.4, 0]} raycast={noHit}>
          <coneGeometry args={[0.095, 0.25, 8]} />
          <meshStandardMaterial color="#b12d19" />
        </mesh>
        <mesh position={[0, -0.55, 0]} rotation={[0, 0, Math.PI]} raycast={noHit}>
          <coneGeometry args={[0.15, 0.65, 8]} />
          <meshBasicMaterial color={[4, 1, 0.08]} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.2, 0]} raycast={noHit}>
          <boxGeometry args={[0.42, 0.16, 0.035]} />
          <meshStandardMaterial color="#637383" metalness={0.7} />
        </mesh>
      </group>
      <points
        ref={trail}
        geometry={trailGeometry}
        visible={false}
        frustumCulled={false}
        raycast={noHit}
      >
        <pointsMaterial
          color={[3, 0.65, 0.04]}
          size={scale * 0.13}
          transparent
          opacity={0.65}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      <Impact target={shot.target} time={time} impactAt={shot.impactAt} camera={camera} />
    </>
  )
}

export default function HectorAttack({
  catalog,
  stations,
  nodes,
  ready,
  running,
  reducedMotion,
  onStatus,
  onComplete,
}: {
  catalog: Catalog
  stations: Constellation[]
  nodes: RefObject<Map<string, THREE.Group>>
  ready: boolean
  running: boolean
  reducedMotion: boolean
  onStatus: (status: HectorStatus) => void
  onComplete: () => void
}) {
  const { camera, size, invalidate } = useThree()
  const time = useRef(-1)
  const ship = useRef<THREE.Group>(null)
  const boost = useRef(1)
  const clock = useRef({ started: 0, hiddenAt: 0, paused: 0 })
  const finished = useRef(false)
  const lastStatus = useRef('')
  const initial = useRef({
    position: camera.position.clone(),
    orientation: camera.quaternion.clone(),
  })
  const targets = useMemo(
    () =>
      stations.flatMap((station, family) =>
        station.instruments.map((item, variant) => {
          const site = catalog.sites.find((site) => site.id === item.id)!
          return {
            id: item.id,
            name: site.name,
            position: new THREE.Vector3(...item.position),
            radius: destinationRadius(family, variant, !!site.image) * item.scale,
          }
        })
      ),
    [catalog, stations]
  )
  const plan = useMemo(() => hectorPlan(targets.map((target) => target.id)), [targets])
  const shots = useMemo(
    () =>
      plan.shots.map((shot) => ({
        ...shot,
        target: targets.find((target) => target.id === shot.id)!,
      })),
    [plan, targets]
  )
  const framing = useMemo(() => {
    const overview = systemOverview(catalog, stations)
    const pose = overviewPose(overview, size.width, size.height, 42, 0, {
      top: 100,
      bottom: size.width < 600 ? 165 : 110,
      left: 55,
      right: 55,
    })
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(pose.orientation)
    const upward = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.orientation)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(pose.orientation)
    const depth = pose.distance * 0.69
    const height = 2 * depth * Math.tan(THREE.MathUtils.degToRad(42) / 2)
    const origin = pose.position.clone().addScaledVector(forward, depth)
    const projector = new THREE.PerspectiveCamera(42, size.width / size.height, 0.035, 10000)
    projector.position.copy(pose.position)
    projector.quaternion.copy(pose.orientation)
    projector.updateMatrixWorld()
    const aims = plan.batches.map((batch) =>
      batch
        .reduce(
          (sum, id) => sum.add(targets.find((target) => target.id === id)!.position),
          new THREE.Vector3()
        )
        .divideScalar(batch.length)
    )
    const waypoints = aims.map((aim, index) => {
      const center = aim.clone().project(projector)
      return new THREE.Vector2(
        THREE.MathUtils.clamp(center.x + (index % 2 ? -0.37 : 0.37), -0.7, 0.7),
        THREE.MathUtils.clamp(center.y + (index % 3 ? -0.25 : 0.3), -0.55, 0.55)
      )
    })
    const screenAt = (t: number) => {
      const first = waypoints[0] ?? new THREE.Vector2(0.3, 0.15)
      if (t < plan.attackAt) {
        const u = t / HECTOR_ARRIVAL
        const point = new THREE.Vector2(-1.6, 0.7).lerp(first, smooth(u))
        if (!reducedMotion) point.y += Math.sin(u * Math.PI * 3) * 0.3 * Math.sin(u * Math.PI)
        return point
      }
      if (t >= plan.departAt) {
        const u = (t - plan.departAt) / HECTOR_DEPARTURE
        const last = waypoints.at(-1) ?? first
        const point = last.clone().lerp(new THREE.Vector2(1.6, 1.25), u * u)
        if (!reducedMotion) {
          point.x += Math.sin(u * Math.PI * 2) * 0.25 * (1 - u)
          point.y += Math.sin(u * Math.PI * 3) * 0.23 * (1 - u)
        }
        return point
      }
      const index = Math.min(
        waypoints.length - 1,
        Math.max(0, Math.floor((t - plan.attackAt) / plan.beat))
      )
      const previous = index > 0 ? waypoints[index - 1] : first
      const next = waypoints[index] ?? first
      const u = THREE.MathUtils.clamp((t - plan.attackAt - index * plan.beat) / plan.beat, 0, 1)
      const point = previous.clone().lerp(next, smooth(u))
      if (!reducedMotion) {
        point.x += Math.sin(t * 4.3) * 0.045
        point.y += Math.sin(t * 3.1 + index) * 0.07
      }
      return point
    }
    const positionAt = (t: number) => {
      const p = screenAt(t)
      return origin
        .clone()
        .addScaledVector(right, (p.x * height * size.width) / size.height / 2)
        .addScaledVector(upward, (p.y * height) / 2)
    }
    return { pose, right, upward, height, positionAt, screenAt, aims }
  }, [catalog, stations, size.width, size.height, targets, plan, reducedMotion])
  useEffect(() => {
    const visibility = () => {
      if (!clock.current.started) return
      const now = performance.now()
      if (document.hidden) clock.current.hiddenAt = now
      else if (clock.current.hiddenAt) {
        clock.current.paused += now - clock.current.hiddenAt
        clock.current.hiddenAt = 0
      }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      for (const node of nodes.current.values()) node.visible = true
    }
  }, [nodes])
  useFrame((_, delta) => {
    if (!ready || !running || document.hidden) return
    if (!clock.current.started) clock.current.started = performance.now()
    const t = (performance.now() - clock.current.started - clock.current.paused) / 1000
    time.current = t
    const transition = reducedMotion ? 1 : smooth(t / 1.7)
    camera.position.lerpVectors(initial.current.position, framing.pose.position, transition)
    camera.quaternion.slerpQuaternions(
      initial.current.orientation,
      framing.pose.orientation,
      transition
    )
    camera.far = Math.max(500, framing.pose.distance * 4)
    const recent = shots.reduce(
      (sum, shot) => sum + Math.max(0, 1 - (t - shot.impactAt) / 0.35) * Number(t >= shot.impactAt),
      0
    )
    if (!reducedMotion && recent) {
      camera.position.addScaledVector(
        framing.right,
        Math.sin(t * 39) * Math.min(0.18, recent * 0.07)
      )
      camera.position.addScaledVector(
        framing.upward,
        Math.sin(t * 31) * Math.min(0.12, recent * 0.05)
      )
    }
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const position = framing.positionAt(t)
    ship.current!.visible = t < plan.endAt
    ship.current!.position.copy(position)
    const direction = framing.screenAt(t + 0.025).sub(framing.screenAt(t - 0.025))
    let roll = Math.atan2(-direction.x, direction.y)
    if (t >= plan.attackAt && t < plan.departAt && framing.aims.length) {
      const volley = Math.min(framing.aims.length - 1, Math.floor((t - plan.attackAt) / plan.beat))
      const aim = framing.aims[volley].clone().sub(position)
      roll = Math.atan2(-aim.dot(framing.right), aim.dot(framing.upward))
    }
    const bank = reducedMotion ? 0 : Math.sin(t * 3.4) * 0.23
    const orientation = framing.pose.orientation
      .clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(bank, bank * 0.6, roll)))
    if (!reducedMotion && t >= plan.departAt) {
      const flourish = smooth((t - plan.departAt) / HECTOR_DEPARTURE) * Math.PI * 2
      orientation.multiply(new THREE.Quaternion().setFromAxisAngle(up, flourish))
    }
    ship.current!.quaternion.slerp(
      orientation,
      reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 1) * 16)
    )
    ship.current!.scale.setScalar(framing.height * 0.033)
    boost.current = t >= plan.departAt ? 1 + ((t - plan.departAt) / HECTOR_DEPARTURE) * 4.08 : 1.15
    let destroyed = 0
    for (const shot of shots) {
      const hit = t >= shot.impactAt
      const node = nodes.current.get(shot.id)
      if (node) node.visible = !hit
      if (hit) destroyed++
    }
    const phase = t < plan.attackAt ? 'arrival' : t < plan.departAt ? 'attack' : 'departure'
    const volley = Math.max(
      0,
      Math.min(plan.batches.length - 1, Math.floor((t - plan.attackAt) / plan.beat))
    )
    const message =
      phase === 'arrival'
        ? ''
        : phase === 'departure'
          ? 'Patrol complete. Hector out.'
          : destroyed === targets.length
            ? 'Orbital traffic cleared. Every last one.'
            : [
                `Clearing a little orbital traffic.`,
                `Your bookmarks cannot save you.`,
                `Resistance is… adorable.`,
                `Nothing personal. Just passing through.`,
              ][volley % 4]
    const key = `${phase}:${destroyed}:${volley}`
    if (lastStatus.current !== key) {
      lastStatus.current = key
      onStatus({ phase, destroyed, total: targets.length, message })
    }
    if (t >= plan.endAt && !finished.current) {
      finished.current = true
      onComplete()
    }
    invalidate()
  }, -0.5)
  return (
    <group name="captain-hector">
      <group ref={ship} visible={false}>
        <HectorShip boost={boost} />
      </group>
      {shots.map((shot) => (
        <Ordnance
          key={shot.id}
          shot={shot}
          time={time}
          origin={framing.positionAt}
          right={framing.right}
          upward={framing.upward}
          scale={framing.height * 0.033}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  )
}
