"use strict";
let b;
let gl, gr, xx, data;
const canvas = document.createElement("canvas");
b = canvas.transferControlToOffscreen();
b.width = 48;
b.height = 48;
gl = b.getContext('2d')
gl.scale(0.384, 0.384)
gr = gl.createRadialGradient(33, 18, 8, 42, 10, 226)
gl.fillStyle = gr
gl.shadowBlur = 11
gl.shadowColor = '#F38020'
gl.beginPath()
gl.moveTo(9, 14);
gl["quadraticCurveTo"](93, 48, 116, 111);
gl.stroke();
gl.fill()
gl.shadowBlur = 0
gr = gl.createRadialGradient(77, 98, 2, 27, 30, 206)
gl.fillStyle = gr
gl.beginPath()
gl.ellipse(58, 55, 31, 28, 1.4441705959829747, 0.5401125108618993, 4.052233984744969)
gl.stroke()
gl.fill()
gl.shadowBlur = 0
gr = gl.createRadialGradient(108, 12, 10, 65, 118, 169)
gl.fillStyle = gr
gl.shadowBlur = 16
gl.shadowColor = '#809980'
gl.font = '27.77777777777778px aanotafontaa'
gl.fillText('Ry', 13, 67)
gl.shadowBlur = 0
gr = gl.createRadialGradient(46, 47, 0, 101, 108, 207)
gl.fillStyle = gr
gl.shadowBlur = 3
gl.shadowColor = "#FF6633"
gl.beginPath()
gl.moveTo(54, 5)
gl.bezierCurveTo(54, 90, 32, 74, 71, 120)
gl.stroke()
gl.fill()
gl.shadowBlur = 0
gr = gl.createRadialGradient(119, 123, 3, 109, 90, 137)
gl.fillStyle = gr
gl.shadowBlur = 4
gl.shadowColor = 'red'
gl.beginPath()
gl.moveTo(76, 0)
gl.bezierCurveTo(1, 49, 103, 67, 49, 125)
gl.stroke()
gl.fill()
gl.shadowBlur = 0
gr = gl.createConicGradient(34, 47, 1)
gl.fillStyle = gr
gl.beginPath()
gl.ellipse(56, 57, 14, 8, 1.2273132071162383, 4.1926143018618225, 2.8853539230051624)
gl.stroke()
gl.fill()
gl.shadowBlur = 0
gl.shadowBlur = 14
gl.shadowColor = '#809900'
gl.font = '11.904761904761905px aanotafont'
gl.strokeText('@H1', 30, 73)
gl.shadowBlur = 0;
xx = gl.getImageData(0, 0, 48, 48);
data = Array.from(xx.data);
copy(data)