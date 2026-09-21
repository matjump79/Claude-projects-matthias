import { chromium } from 'playwright';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-gpu-sandbox','--ignore-gpu-blocklist','--enable-features=Vulkan'],
});
const p = await b.newPage({ viewport:{width:640,height:360} });
const info = await p.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if(!gl) return {ok:false};
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return {ok:true, ver: gl.getParameter(gl.VERSION), renderer: d? gl.getParameter(d.UNMASKED_RENDERER_WEBGL): 'n/a',
          maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), aniso: !!gl.getExtension('EXT_texture_filter_anisotropic'), depthTex: !!gl.getExtension('WEBGL_depth_texture')};
});
console.log(JSON.stringify(info));
await b.close();
