import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { asset } from './catalog'
import type { ContextRaster } from './context'

type Frame = { raster: ContextRaster; image: HTMLImageElement }
const images = new Map<string, Promise<Frame>>()

export function loadRaster(raster: ContextRaster) {
  const cached = images.get(raster.url)
  if (cached) {
    images.delete(raster.url)
    images.set(raster.url, cached)
    return cached
  }
  const image = new Image()
  const pending = new Promise<Frame>((resolve, reject) => {
    image.onload = () => resolve({ raster, image })
    image.onerror = () => {
      if (images.get(raster.url) === pending) images.delete(raster.url)
      reject(new Error('Radar image could not load'))
    }
    image.src = asset(raster.url)
  })
  images.set(raster.url, pending)
  if (images.size > 8) images.delete(images.keys().next().value!)
  return pending
}

type GL = WebGLRenderingContext | WebGL2RenderingContext

export function rasterSwipe(map: MapLibreMap) {
  let right: Frame | undefined
  let left: Frame | undefined
  let split = .5
  let setup: ReturnType<typeof createResources> | undefined
  const textures = new Map<Frame, WebGLTexture>()

  function upload(gl: GL, frame: Frame) {
    const existing = textures.get(frame)
    if (existing) return existing
    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.image)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    textures.set(frame, texture)
    return texture
  }

  function restore() {
    const gl = map.getCanvas().getContext('webgl2') ?? map.getCanvas().getContext('webgl')
    if (!gl) return
    textures.clear()
    setup = createResources(gl)
    map.triggerRepaint()
  }

  const layer: CustomLayerInterface = {
    id: 'observation',
    type: 'custom',
    onAdd(_map, gl) {
      setup = createResources(gl)
      map.on('webglcontextrestored', restore)
    },
    onRemove(_map, gl) {
      map.off('webglcontextrestored', restore)
      for (const texture of textures.values()) gl.deleteTexture(texture)
      textures.clear()
      if (setup) {
        gl.deleteProgram(setup.program)
        gl.deleteBuffer(setup.buffer)
      }
      setup = undefined
    },
    render(gl) {
      if (!setup) return
      const { program, buffer, position, uv, clip, sampler } = setup
      for (const [frame, texture] of textures) {
        if (frame === left || frame === right) continue
        textures.delete(frame)
        gl.deleteTexture(texture)
      }
      const { clientWidth: width, clientHeight: height } = map.getCanvas()
      if (!width || !height) return
      const edges = gl.drawingBufferWidth
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(position)
      gl.enableVertexAttribArray(uv)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1i(sampler, 0)

      function draw(frame: Frame | undefined, min: number, max: number) {
        if (!frame || min === max) return
        const texture = upload(gl, frame)
        if (!texture) return
        const points = frame.raster.coordinates.map(point => map.project(point))
        const vertices = [0, 3, 1, 2].flatMap(index => [
          points[index].x * 2 / width - 1,
          1 - points[index].y * 2 / height,
          index === 1 || index === 2 ? 1 : 0,
          index >= 2 ? 1 : 0,
        ])
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW)
        gl.uniform2f(clip, min, max)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      const divider = left && right ? Math.round(edges * split) : 0
      draw(right, divider, edges)
      draw(left, 0, divider)
      gl.disableVertexAttribArray(position)
      gl.disableVertexAttribArray(uv)
    },
  }
  return {
    layer,
    setFrames(nextRight?: Frame, nextLeft?: Frame) {
      right = nextRight
      left = nextLeft
      map.triggerRepaint()
    },
    setSplit(value: number) {
      split = value / 100
      map.triggerRepaint()
    },
  }
}

function createResources(gl: GL) {
  const program = gl.createProgram()!
  function attach(type: number, source: string) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Raster shader failed')
    gl.attachShader(program, shader)
    gl.deleteShader(shader)
  }
  attach(gl.VERTEX_SHADER, `
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 texCoord;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
      texCoord = uv;
    }
  `)
  attach(gl.FRAGMENT_SHADER, `
    precision highp float;
    uniform sampler2D image;
    uniform vec2 clip;
    varying vec2 texCoord;
    void main() {
      if (gl_FragCoord.x < clip.x || gl_FragCoord.x >= clip.y) discard;
      gl_FragColor = texture2D(image, texCoord);
    }
  `)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Raster shader failed')
  return {
    program, buffer: gl.createBuffer()!,
    position: gl.getAttribLocation(program, 'position'),
    uv: gl.getAttribLocation(program, 'uv'),
    clip: gl.getUniformLocation(program, 'clip'),
    sampler: gl.getUniformLocation(program, 'image'),
  }
}
