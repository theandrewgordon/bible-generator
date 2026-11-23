export function drawMirroredVideo(ctx, video, w, h, beatPulse, theme, isFrozen = false) {
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  if (isFrozen) {
    ctx.fillStyle = "rgba(14, 116, 144, 0.36)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#67e8f9";
    ctx.lineWidth = 18;
    ctx.strokeRect(0, 0, w, h);
  } else {
    ctx.fillStyle = `rgba(${theme.tintRgba}, ${0.3 - beatPulse * 0.08})`;
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawLaneDivider(ctx, w, h) {
  ctx.save();
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.lineTo(w * 0.5, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.stroke();

  ctx.font = "900 14px sans-serif";
  ctx.fillStyle = "rgba(0, 240, 255, 0.65)";
  ctx.textAlign = "right";
  ctx.fillText("◀ P1 ZONE", w * 0.5 - 14, h - 18);
  ctx.fillStyle = "rgba(255, 42, 133, 0.65)";
  ctx.textAlign = "left";
  ctx.fillText("P2 ZONE ▶", w * 0.5 + 14, h - 18);
  ctx.restore();
}

export function drawLavaWave(ctx, w, h, lavaLevel, gameMode, theme) {
  const lavaHeight = h * 0.24 * lavaLevel;
  const lavaTopY = h - lavaHeight;

  const grad = ctx.createLinearGradient(0, lavaTopY, 0, h);
  grad.addColorStop(0, theme.floorColors[0]);
  grad.addColorStop(0.25, theme.floorColors[1]);
  grad.addColorStop(1, theme.floorColors[2]);

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, lavaTopY);
  for (let x = 0; x <= w; x += 25) {
    const wave = Math.sin(x * 0.03 + performance.now() * 0.008) * 8;
    ctx.lineTo(x, lavaTopY + wave);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    gameMode === "hands" ? theme.floorTextHands : theme.floorTextFull,
    w * 0.5,
    lavaTopY + 34
  );
  ctx.restore();

  return lavaTopY;
}

export function drawLaserLine(ctx, w, laserY, anyHit, theme) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, laserY);
  ctx.lineTo(w, laserY);
  ctx.lineWidth = anyHit ? 18 : 10;
  ctx.strokeStyle = anyHit ? "#ffffff" : theme.overheadColor;
  ctx.shadowColor = theme.overheadColor;
  ctx.shadowBlur = 20;
  ctx.stroke();

  ctx.fillStyle = "#fde047";
  ctx.font = "900 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(theme.overheadText, w * 0.5, laserY - 14);
  ctx.restore();
}

export function drawPowerGate(ctx, w, h, progress, numPlayers) {
  const gateY = h * 0.24;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(0, gateY);
  ctx.lineTo(w, gateY);
  ctx.lineWidth = 4;
  ctx.strokeStyle = progress >= 1 ? "#4ade80" : "#fde047";
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw glowing hand-hold zones
  const zones =
    numPlayers === 1
      ? [0.32, 0.68]
      : [0.15, 0.35, 0.65, 0.85];

  for (const zx of zones) {
    ctx.beginPath();
    ctx.arc(w * zx, gateY - 18, 34, 0, Math.PI * 2);
    ctx.fillStyle = progress >= 1 ? "rgba(74, 222, 128, 0.35)" : "rgba(250, 204, 21, 0.25)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = progress >= 1 ? "#4ade80" : "#fde047";
    ctx.stroke();
  }

  // Charge bar above gate line
  const barW = 220;
  const barH = 14;
  const bx = (w - barW) * 0.5;
  const by = gateY + 12;
  ctx.fillStyle = "rgba(15, 10, 8, 0.85)";
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = "#4ade80";
  ctx.fillRect(bx, by, barW * Math.min(1, progress), barH);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, barW, barH);
  ctx.restore();
}

function drawPolygon(ctx, cx, cy, sides, radius, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotation + (i * Math.PI) / spikes;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawTarget(ctx, t, tx, ty, visualNow, targetStyle = "crystal") {
  const progress = Math.min(
    1.25,
    Math.max(0, (visualNow - t.spawnTime) / (t.hitTime - t.spawnTime))
  );
  const isImmediate = progress >= 0.52;
  const popScale = Math.min(1, Math.max(0.25, progress * 4.5));
  const approachRadius = t.radius + Math.max(0, (1 - progress) * 80);
  const spin = visualNow * 1.4;

  ctx.save();
  ctx.globalAlpha = isImmediate ? 1.0 : 0.62;
  ctx.translate(tx, ty);
  ctx.scale(popScale, popScale);
  ctx.translate(-tx, -ty);

  // Shrinking timing ring (bright white when ready to hit)
  ctx.beginPath();
  ctx.arc(tx, ty, approachRadius, 0, Math.PI * 2);
  ctx.lineWidth = isImmediate ? 5 : 3;
  ctx.strokeStyle = progress >= 0.78 ? "#ffffff" : t.color + "99";
  ctx.stroke();

  // Theme-specific interactive object shape
  if (targetStyle === "crystal") {
    drawPolygon(ctx, tx, ty, 6, t.radius, spin * 0.35);
    ctx.fillStyle = t.color + "44";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = t.color;
    ctx.stroke();

    // Inner crystal facet highlight
    drawPolygon(ctx, tx, ty, 6, t.radius * 0.55, -spin * 0.35);
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (targetStyle === "star") {
    drawStar(ctx, tx, ty, 5, t.radius * 1.12, t.radius * 0.52, -Math.PI / 2 + Math.sin(spin) * 0.15);
    ctx.fillStyle = t.color + "48";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#fde047";
    ctx.stroke();
  } else {
    // Space Energy Orb with orbital ring
    ctx.beginPath();
    ctx.arc(tx, ty, t.radius, 0, Math.PI * 2);
    ctx.fillStyle = t.color + "40";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = t.color;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(tx, ty, t.radius * 1.18, t.radius * 0.42, spin * 0.6, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffffaa";
    ctx.stroke();
  }

  const icon = t.limbId.includes("hand") ? "✋" : "👟";
  const side = t.limbId.startsWith("left") ? "L" : "R";

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 5;
  ctx.fillText(icon, tx, ty - 6);

  ctx.font = "900 12px sans-serif";
  ctx.fillText(side, tx, ty + 14);
  ctx.restore();
}

export function drawCoachSilhouette(ctx, w, h, targets, activeChallenge, beatPulse) {
  const boxW = 128;
  const boxH = 154;
  const bx = 18;
  const by = h - boxH - 18;

  ctx.save();
  ctx.fillStyle = "rgba(18, 12, 28, 0.78)";
  ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fde047";
  ctx.font = "900 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("COACH PREVIEW", bx + boxW * 0.5, by + 16);

  const cx = bx + boxW * 0.5;
  const bounce = activeChallenge?.type === "FREEZE" ? 0 : beatPulse * 4;
  const isDuck = activeChallenge?.type === "DUCK";
  const isJump =
    activeChallenge?.type === "LAVA" ||
    activeChallenge?.type === "JUMP" ||
    activeChallenge?.type === "GATE";

  const headY = by + (isDuck ? 66 : isJump ? 36 : 44) - bounce;
  const shoulderY = headY + 18;
  const hipY = shoulderY + 34;

  const p1Targets = targets.filter((t) => t.playerIdx === 0);
  const lhTarget = p1Targets.find((t) => t.limbId === "left_hand");
  const rhTarget = p1Targets.find((t) => t.limbId === "right_hand");
  const lfTarget = p1Targets.find((t) => t.limbId === "left_foot");
  const rfTarget = p1Targets.find((t) => t.limbId === "right_foot");

  const lHandPos = isJump
    ? { x: cx - 32, y: headY - 14 }
    : lhTarget
      ? { x: cx - 36, y: by + 26 + lhTarget.y * 85 }
      : { x: cx - 22, y: hipY - 4 };

  const rHandPos = isJump
    ? { x: cx + 32, y: headY - 14 }
    : rhTarget
      ? { x: cx + 36, y: by + 26 + rhTarget.y * 85 }
      : { x: cx + 22, y: hipY - 4 };

  const lFootPos = isJump
    ? { x: cx - 20, y: hipY + 24 }
    : lfTarget
      ? { x: cx - 30, y: hipY + 22 }
      : { x: cx - 14, y: hipY + 36 };

  const rFootPos = isJump
    ? { x: cx + 20, y: hipY + 24 }
    : rfTarget
      ? { x: cx + 30, y: hipY + 22 }
      : { x: cx + 14, y: hipY + 36 };

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(cx, shoulderY);
  ctx.lineTo(cx, hipY);
  ctx.stroke();

  ctx.strokeStyle = lhTarget || isJump ? "#00f0ff" : "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(cx, shoulderY);
  ctx.lineTo(lHandPos.x, lHandPos.y);
  ctx.stroke();

  ctx.strokeStyle = rhTarget || isJump ? "#ff2a85" : "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(cx, shoulderY);
  ctx.lineTo(rHandPos.x, rHandPos.y);
  ctx.stroke();

  ctx.strokeStyle = lfTarget || isJump ? "#fde047" : "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(cx, hipY);
  ctx.lineTo(lFootPos.x, lFootPos.y);
  ctx.stroke();

  ctx.strokeStyle = rfTarget || isJump ? "#4ade80" : "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(cx, hipY);
  ctx.lineTo(rFootPos.x, rFootPos.y);
  ctx.stroke();

  ctx.fillStyle = activeChallenge?.type === "FREEZE" ? "#67e8f9" : "#fde047";
  ctx.beginPath();
  ctx.arc(cx, headY, 10, 0, Math.PI * 2);
  ctx.fill();

  const nodes = [
    { pos: lHandPos, color: "#00f0ff", active: Boolean(lhTarget || isJump) },
    { pos: rHandPos, color: "#ff2a85", active: Boolean(rhTarget || isJump) },
    { pos: lFootPos, color: "#fde047", active: Boolean(lfTarget || isJump) },
    { pos: rFootPos, color: "#4ade80", active: Boolean(rfTarget || isJump) }
  ];
  for (const n of nodes) {
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(n.pos.x, n.pos.y, n.active ? 6.5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Renders a multi-point sweeping hand-trace ribbon (Rainbow Arc, Halo Circle, Cross-Wave, or Zig-Zag)
 */
export function drawTracePath(ctx, trace, w, h, visualNow) {
  const pts = trace.points.map((p) => ({ x: p.x * w, y: p.y * h }));
  if (pts.length < 2) return;

  const progress = Math.min(
    1,
    Math.max(0, (visualNow - trace.spawnTime) / (trace.endTime - trace.spawnTime))
  );

  ctx.save();

  // 1. Background dashed guide track
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([14, 14]);
  ctx.strokeStyle = trace.color + "55";
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Completed glowing ribbon up to trace.completedIdx
  if (trace.completedIdx > 0) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= trace.completedIdx && i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.lineWidth = 16;
    ctx.strokeStyle = "#fde047";
    ctx.shadowColor = "#fde047";
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // 3. Checkpoint nodes along the path
  pts.forEach((pt, idx) => {
    const done = idx <= trace.completedIdx;
    const isNext = idx === trace.completedIdx + 1;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isNext ? 20 : 12, 0, Math.PI * 2);
    ctx.fillStyle = done ? "#fde047" : isNext ? trace.color : "rgba(255,255,255,0.25)";
    ctx.fill();
    if (isNext) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  });

  // 4. Moving Pacer Orb showing ideal hand speed along the ribbon
  const exactSeg = progress * (pts.length - 1);
  const segIdx = Math.min(pts.length - 2, Math.floor(exactSeg));
  const segT = exactSeg - segIdx;
  const pacerX = pts[segIdx].x + (pts[segIdx + 1].x - pts[segIdx].x) * segT;
  const pacerY = pts[segIdx].y + (pts[segIdx + 1].y - pts[segIdx].y) * segT;

  ctx.beginPath();
  ctx.arc(pacerX, pacerY, 24, 0, Math.PI * 2);
  ctx.fillStyle = trace.color + "66";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`TRACE ${trace.label}`, pts[0].x, pts[0].y - 26);

  ctx.restore();
}
