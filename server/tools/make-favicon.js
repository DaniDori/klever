/* Клевер для вкладки браузера: PNG и ICO рисуются здесь, без внешних
   библиотек, по тем же фигурам, что в assets/favicon.svg.
   Запуск после правки значка: node server/tools/make-favicon.js .
   Внутрь папки server статика не отдаётся, поэтому инструмент лежит тут. */
var fs = require('fs');
var zlib = require('zlib');
var path = require('path');

var OUT = process.argv[2];

var CREAM = [0xFB, 0xFA, 0xF6];
var CLOVER = [0x4F, 0x6B, 0x4A];

/* Кривая Безье в ломаную: и лист, и стебель заданы кубическими сегментами,
   а проверять попадание точки удобнее в многоугольник. */
function flatten(segments, steps) {
  var pts = [];
  segments.forEach(function (s) {
    for (var i = 1; i <= steps; i++) {
      var t = i / steps, u = 1 - t;
      pts.push([
        u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
        u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1]
      ]);
    }
  });
  return pts;
}

/* Сердце остриём в точке (0,0), телом вверх — тот же путь, что LEAF в ui.js:
   M0 0 C-7 -11 -20 -16 -20 -26 C-20 -33 -11 -36 0 -28 C11 -36 20 -33 20 -26
   C20 -16 7 -11 0 0 Z */
var HEART = flatten([
  [[0, 0], [-7, -11], [-20, -16], [-20, -26]],
  [[-20, -26], [-20, -33], [-11, -36], [0, -28]],
  [[0, -28], [11, -36], [20, -33], [20, -26]],
  [[20, -26], [20, -16], [7, -11], [0, 0]]
], 24);

/* Четыре листа: тот же контур, повёрнутый вокруг общего острия в (50,46) */
var LEAVES = [0, 90, 180, 270].map(function (deg, i) {
  var rad = deg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    a: [0.8, 1, 1, 0.8][i],
    poly: HEART.map(function (p) {
      return [50 + p[0] * cos - p[1] * sin, 46 + p[0] * sin + p[1] * cos];
    })
  };
});

/* Стебель: кубическая кривая M50 72 c0 11 -3 20 -11 25 */
var STEM = flatten([[[50, 72], [50, 83], [47, 92], [39, 97]]], 64);
var STEM_R = 2.75;

/* Точка внутри многоугольника: считаем пересечения луча вправо */
function inPolygon(x, y, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, a, b) {
  var vx = b[0] - a[0], vy = b[1] - a[1];
  var wx = px - a[0], wy = py - a[1];
  var len = vx * vx + vy * vy;
  var t = len ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len)) : 0;
  var dx = wx - t * vx, dy = wy - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
}

/* Скруглённый квадрат подложки */
function inRounded(x, y, size, r) {
  var cx = Math.min(Math.max(x, r), size - r);
  var cy = Math.min(Math.max(y, r), size - r);
  var dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function render(size) {
  var SS = 4;                       /* сглаживание: считаем 4x4 подпикселя */
  var buf = Buffer.alloc(size * size * 4);
  var scale = 100 / size;

  for (var py = 0; py < size; py++) {
    for (var px = 0; px < size; px++) {
      var bgHits = 0, ink = 0;
      for (var sy = 0; sy < SS; sy++) {
        for (var sx = 0; sx < SS; sx++) {
          var fx = px + (sx + 0.5) / SS;
          var fy = py + (sy + 0.5) / SS;
          if (!inRounded(fx, fy, size, 22 / scale)) continue;
          bgHits++;

          var ux = fx * scale, uy = fy * scale;   /* координаты в системе 0..100 */
          var cover = 0;
          for (var i = 0; i < LEAVES.length; i++) {
            if (inPolygon(ux, uy, LEAVES[i].poly)) cover = Math.max(cover, LEAVES[i].a);
          }
          if (cover < 1) {
            for (var k = 1; k < STEM.length; k++) {
              if (distToSegment(ux, uy, STEM[k - 1], STEM[k]) <= STEM_R) { cover = 1; break; }
            }
          }
          ink += cover;
        }
      }

      var total = SS * SS;
      var o = (py * size + px) * 4;
      if (!bgHits) { buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = 0; continue; }
      var alpha = bgHits / total;
      var inkPart = ink / bgHits;                 /* доля зелени внутри подложки */
      for (var c = 0; c < 3; c++) {
        buf[o + c] = Math.round(CREAM[c] * (1 - inkPart) + CLOVER[c] * inkPart);
      }
      buf[o + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

function crc32(buf) {
  var c, table = crc32.table || (crc32.table = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  var rgba = render(size);
  var raw = Buffer.alloc((size * 4 + 1) * size);
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function ico(sizes) {
  var images = sizes.map(function (s) { return { size: s, data: png(s) }; });
  var header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  var offset = 6 + images.length * 16;
  var dir = [];
  images.forEach(function (im) {
    var e = Buffer.alloc(16);
    e[0] = im.size >= 256 ? 0 : im.size;
    e[1] = im.size >= 256 ? 0 : im.size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(im.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += im.data.length;
    dir.push(e);
  });
  return Buffer.concat([header].concat(dir, images.map(function (im) { return im.data; })));
}

fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico([16, 32, 48]));
fs.writeFileSync(path.join(OUT, 'assets', 'apple-touch-icon.png'), png(180));
console.log('готово');
