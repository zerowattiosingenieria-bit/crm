/* Junta los .gs numerados en apps-script/TODO_EN_UNO.gs, que es el archivo
   que se pega de golpe al montar el proyecto en Apps Script. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'apps-script');
const archivos = fs.readdirSync(dir).filter(f => /^\d\d_.*\.gs$/.test(f)).sort();
/* La cabecera se conserva de la vuelta anterior, recortada: el separador ya
   pone sus propias líneas en blanco y, sin recortar, el archivo engordaba dos
   líneas en cada regeneración. */
const cabecera = fs.readFileSync(path.join(dir, 'TODO_EN_UNO.gs'), 'utf8')
  .split('/* =====')[0].replace(/\s+$/, '');
const partes = [cabecera];
archivos.forEach(f => {
  partes.push('\n\n/* ==========================================================================\n' +
    '   ' + f + '\n' +
    '   ========================================================================== */\n\n');
  partes.push(fs.readFileSync(path.join(dir, f), 'utf8'));
});
fs.writeFileSync(path.join(dir, 'TODO_EN_UNO.gs'), partes.join(''));
console.log('TODO_EN_UNO.gs generado con ' + archivos.length + ' archivos.');
