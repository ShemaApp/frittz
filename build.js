const esbuild = require('esbuild');
const fs = require('fs');

const files = [
  'firebase-init', 'app-core', 'auth', 'dashboard', 'productos',
  'clientes', 'pedidos', 'creditos', 'ruta', 'config', 'app',
  'rutas-repartidores', 'inventario', 'reportes', 'gerencia', 'permisos'
];

console.log('🔨 Compilando archivos JSX...\n');

// Asegurar que existe la carpeta compiled/
if (!fs.existsSync('compiled')) {
  fs.mkdirSync('compiled', { recursive: true });
}

files.forEach(file => {
  const inputPath = `${file}.js`;
  const outputPath = `compiled/${file}.js`;
  
  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️ ${inputPath} no encontrado, saltando...`);
    return;
  }
  
  try {
    esbuild.buildSync({
      entryPoints: [inputPath],
      outfile: outputPath,
      format: 'iife',
      globalName: file.replace(/-/g, '_'),
      platform: 'browser',
      target: ['es2017'],
      loader: { '.js': 'jsx' },
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      minify: true,
      sourcemap: false,
      logLevel: 'silent'
    });
    
    const stats = fs.statSync(outputPath);
    const size = (stats.size / 1024).toFixed(1);
    console.log(`✅ ${file}.js → compiled/${file}.js (${size}KB)`);
  } catch (err) {
    console.log(`❌ Error compilando ${file}.js:`, err.message);
  }
});

console.log('\n🎯 ¡Compilación completa!');
console.log('📦 Ejecuta "npm run watch" para modo desarrollo');