import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'

/** Dim the complete instrument in linear color space without changing depth or hit testing. */
export default function InstrumentEmphasis({
  brightness,
  children,
}: {
  brightness: THREE.IUniform<number>
  children: ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const materials = new Set<THREE.Material>()
    group.current?.traverse((object) => {
      if (object instanceof THREE.Mesh)
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(material)
    })
    const restore = [...materials].map((material) => {
      const compile = material.onBeforeCompile
      const cacheKey = material.customProgramCacheKey
      const originalKey = cacheKey.call(material)
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer)
        shader.uniforms.instrumentBrightness = brightness
        shader.fragmentShader = `uniform float instrumentBrightness;\n${shader.fragmentShader}`
        const dim = 'gl_FragColor.rgb *= instrumentBrightness;\n'
        // Standard materials and planetary shaders dim before tone mapping; additive
        // beacons have no tone mapping chunk and dim at the end of their main function.
        if (shader.fragmentShader.includes('#include <tonemapping_fragment>'))
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <tonemapping_fragment>',
            `${dim}#include <tonemapping_fragment>`
          )
        else {
          const end = shader.fragmentShader.lastIndexOf('}')
          shader.fragmentShader =
            shader.fragmentShader.slice(0, end) + dim + shader.fragmentShader.slice(end)
        }
      }
      material.customProgramCacheKey = () => `${originalKey}:instrument-emphasis-v1`
      material.needsUpdate = true
      return () => {
        material.onBeforeCompile = compile
        material.customProgramCacheKey = cacheKey
        material.needsUpdate = true
      }
    })
    return () => restore.forEach((reset) => reset())
  }, [brightness])
  return <group ref={group}>{children}</group>
}
