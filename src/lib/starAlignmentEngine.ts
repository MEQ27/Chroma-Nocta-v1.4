/**
 * Chroma Nocta — Relative Star-Triangle Plate-Solve & HFR Alignment Engine
 *
 * Provides offline star detection (subpixel centroid & Half-Flux Radius),
 * geometric asterism triangle matching between multi-night imaging sessions,
 * and exact framing error resolution (Delta Position Angle, Delta Az/Alt, Focus status).
 *
 * ZERO TYPE ESCAPES: 0 any, 0 as Type, 0 as const, 0 non-null !
 */

export interface DetectedStar {
  readonly x: number; // normalized 0..1
  readonly y: number; // normalized 0..1
  readonly flux: number;
  readonly hfrPx: number;
}

export interface FrameAlignmentSolution {
  readonly matchedStarsCount: number;
  readonly rotationDeltaDeg: number; // + clockwise, - counter-clockwise camera PA correction
  readonly shiftXPercent: number;    // horizontal framing offset %
  readonly shiftYPercent: number;    // vertical framing offset %
  readonly shiftAzDeg: number;       // angular Azimuth correction based on FOV
  readonly shiftAltDeg: number;      // angular Altitude correction based on FOV
  readonly refAvgHfrPx: number;
  readonly testAvgHfrPx: number;
  readonly focusStatus: 'sharp' | 'soft' | 'degraded';
  readonly instructionSummary: string;
}

interface PixelSample {
  readonly dist: number;
  readonly flux: number;
}

interface TriangleCandidate {
  readonly i: number;
  readonly j: number;
  readonly k: number;
  readonly s1: number;
  readonly s2: number;
  readonly s3: number;
  readonly r1: number;
  readonly r2: number;
}

/**
 * Detects bright point-source stars from image buffer with sub-pixel centroid
 * and Half-Flux Radius (HFR) optical focus calculation.
 */
export function detectBrightStarsFromImageData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maxStars: number = 35
): DetectedStar[] {
  if (width < 16 || height < 16 || pixels.length === 0) {
    return [];
  }

  const pixelCount = width * height;
  const isRgba = pixels.length >= pixelCount * 4;

  let sumLum = 0;
  let sumSqLum = 0;

  for (let idx = 0; idx < pixelCount; idx++) {
    const offset = isRgba ? idx * 4 : idx;
    let lum = 0;
    if (isRgba) {
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      lum = 0.299 * r + 0.587 * g + 0.114 * b;
    } else {
      lum = pixels[offset] ?? 0;
    }
    sumLum += lum;
    sumSqLum += lum * lum;
  }

  const mean = sumLum / pixelCount;
  const variance = Math.max(0, sumSqLum / pixelCount - mean * mean);
  const sigma = Math.sqrt(variance);
  const threshold = Math.max(16, mean + 3.2 * sigma);

  function getPixelLum(px: number, py: number): number {
    if (px < 0 || px >= width || py < 0 || py >= height) return 0;
    const pIdx = py * width + px;
    if (isRgba) {
      const off = pIdx * 4;
      const r = pixels[off] ?? 0;
      const g = pixels[off + 1] ?? 0;
      const b = pixels[off + 2] ?? 0;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return pixels[pIdx] ?? 0;
  }

  const candidateStars: DetectedStar[] = [];
  const minEdge = 6;
  const maxEdgeX = width - 6;
  const maxEdgeY = height - 6;

  for (let y = minEdge; y < maxEdgeY; y++) {
    for (let x = minEdge; x < maxEdgeX; x++) {
      const centerLum = getPixelLum(x, y);
      if (centerLum < threshold) continue;

      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = getPixelLum(x + dx, y + dy);
          if (neighbor > centerLum) {
            isMax = false;
            break;
          }
        }
      }
      if (!isMax) continue;

      // 5x5 sub-pixel centroiding
      let fluxSum = 0;
      let weightedX = 0;
      let weightedY = 0;

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const lum = getPixelLum(x + dx, y + dy);
          const net = Math.max(0, lum - mean);
          if (net > 0) {
            fluxSum += net;
            weightedX += (x + dx) * net;
            weightedY += (y + dy) * net;
          }
        }
      }

      if (fluxSum <= 0) continue;

      const cX = weightedX / fluxSum;
      const cY = weightedY / fluxSum;

      // Half-Flux Radius (HFR) calculation
      const samples: PixelSample[] = [];
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const lum = getPixelLum(x + dx, y + dy);
          const net = Math.max(0, lum - mean);
          if (net > 0) {
            const dist = Math.hypot(x + dx - cX, y + dy - cY);
            samples.push({ dist, flux: net });
          }
        }
      }

      samples.sort((a, b) => a.dist - b.dist);
      let cumulativeFlux = 0;
      const targetHalfFlux = fluxSum * 0.5;
      let calculatedHfr = 1.0;

      for (const sample of samples) {
        cumulativeFlux += sample.flux;
        if (cumulativeFlux >= targetHalfFlux) {
          calculatedHfr = Math.max(0.5, sample.dist);
          break;
        }
      }

      // Check proximity to existing candidates to avoid double detection
      let isDuplicate = false;
      for (const existing of candidateStars) {
        const exPx = existing.x * width;
        const eyPx = existing.y * height;
        if (Math.hypot(cX - exPx, cY - eyPx) < 5) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        candidateStars.push({
          x: cX / width,
          y: cY / height,
          flux: fluxSum,
          hfrPx: Math.round(calculatedHfr * 100) / 100,
        });
      }
    }
  }

  candidateStars.sort((a, b) => b.flux - a.flux);
  return candidateStars.slice(0, maxStars);
}

function buildTriangles(stars: readonly DetectedStar[], maxCount: number): TriangleCandidate[] {
  const count = Math.min(stars.length, maxCount);
  const triangles: TriangleCandidate[] = [];

  for (let i = 0; i < count - 2; i++) {
    const sI = stars[i];
    if (!sI) continue;
    for (let j = i + 1; j < count - 1; j++) {
      const sJ = stars[j];
      if (!sJ) continue;
      const d1 = Math.hypot(sI.x - sJ.x, sI.y - sJ.y);
      if (d1 < 0.02) continue;

      for (let k = j + 1; k < count; k++) {
        const sK = stars[k];
        if (!sK) continue;
        const d2 = Math.hypot(sJ.x - sK.x, sJ.y - sK.y);
        const d3 = Math.hypot(sK.x - sI.x, sK.y - sI.y);
        if (d2 < 0.02 || d3 < 0.02) continue;

        const sides = [d1, d2, d3];
        sides.sort((a, b) => a - b);
        const s1 = sides[0] ?? 0;
        const s2 = sides[1] ?? 0;
        const s3 = sides[2] ?? 1;

        if (s3 > 0.0001) {
          triangles.push({
            i,
            j,
            k,
            s1,
            s2,
            s3,
            r1: s1 / s3,
            r2: s2 / s3,
          });
        }
      }
    }
  }

  return triangles;
}

/**
 * Solves relative framing transformation between Reference and Test frames
 * using scale-invariant star-triangle asterism identification.
 */
export function solveFrameAlignment(
  refStars: readonly DetectedStar[],
  testStars: readonly DetectedStar[],
  fovWidthDeg: number,
  fovHeightDeg: number
): FrameAlignmentSolution {
  if (refStars.length < 3 || testStars.length < 3) {
    const refHfr = refStars.length > 0
      ? refStars.reduce((acc, s) => acc + s.hfrPx, 0) / refStars.length
      : 0;
    const testHfr = testStars.length > 0
      ? testStars.reduce((acc, s) => acc + s.hfrPx, 0) / testStars.length
      : 0;
    return {
      matchedStarsCount: 0,
      rotationDeltaDeg: 0,
      shiftXPercent: 0,
      shiftYPercent: 0,
      shiftAzDeg: 0,
      shiftAltDeg: 0,
      refAvgHfrPx: Math.round(refHfr * 100) / 100,
      testAvgHfrPx: Math.round(testHfr * 100) / 100,
      focusStatus: 'degraded',
      instructionSummary: 'Insufficient stars (< 3). Align framing manually.',
    };
  }

  const refTriangles = buildTriangles(refStars, 12);
  const testTriangles = buildTriangles(testStars, 12);

  interface AlignmentHypothesis {
    rotationDeg: number;
    shiftX: number;
    shiftY: number;
    matches: number;
    refHfr: number;
    testHfr: number;
  }

  let bestHypothesis: AlignmentHypothesis = {
    rotationDeg: 0,
    shiftX: 0,
    shiftY: 0,
    matches: 0,
    refHfr: 0,
    testHfr: 0,
  };

  const ratioTol = 0.035;

  for (const tRef of refTriangles) {
    for (const tTest of testTriangles) {
      if (
        Math.abs(tRef.r1 - tTest.r1) <= ratioTol &&
        Math.abs(tRef.r2 - tTest.r2) <= ratioTol
      ) {
        // Vertex pairs
        const pRefA = refStars[tRef.i];
        const pRefB = refStars[tRef.j];
        const pTestA = testStars[tTest.i];
        const pTestB = testStars[tTest.j];
        if (!pRefA || !pRefB || !pTestA || !pTestB) continue;

        const angleRef = Math.atan2(pRefB.y - pRefA.y, pRefB.x - pRefA.x);
        const angleTest = Math.atan2(pTestB.y - pTestA.y, pTestB.x - pTestA.x);
        let angleDelta = angleTest - angleRef;
        while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
        while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

        const cosA = Math.cos(angleDelta);
        const sinA = Math.sin(angleDelta);

        // Center of frame translation
        const rotRefX = 0.5 + (pRefA.x - 0.5) * cosA - (pRefA.y - 0.5) * sinA;
        const rotRefY = 0.5 + (pRefA.x - 0.5) * sinA + (pRefA.y - 0.5) * cosA;

        const shiftX = pTestA.x - rotRefX;
        const shiftY = pTestA.y - rotRefY;

        // Count how many ref stars match test stars under this transformation
        let matches = 0;
        let sumRefHfr = 0;
        let sumTestHfr = 0;
        const matchTol = 0.035; // 3.5% of frame

        for (const rStar of refStars) {
          const rx = 0.5 + (rStar.x - 0.5) * cosA - (rStar.y - 0.5) * sinA + shiftX;
          const ry = 0.5 + (rStar.x - 0.5) * sinA + (rStar.y - 0.5) * cosA + shiftY;

          for (const tStar of testStars) {
            const dist = Math.hypot(rx - tStar.x, ry - tStar.y);
            if (dist < matchTol) {
              matches++;
              sumRefHfr += rStar.hfrPx;
              sumTestHfr += tStar.hfrPx;
              break;
            }
          }
        }

        if (matches > bestHypothesis.matches) {
          bestHypothesis = {
            rotationDeg: (angleDelta * 180) / Math.PI,
            shiftX,
            shiftY,
            matches,
            refHfr: matches > 0 ? sumRefHfr / matches : 0,
            testHfr: matches > 0 ? sumTestHfr / matches : 0,
          };
        }
      }
    }
  }

  const matchedCount = bestHypothesis.matches;
  const rotDeg = Math.round(bestHypothesis.rotationDeg * 100) / 100;
  const shiftXPct = Math.round(bestHypothesis.shiftX * 10000) / 100;
  const shiftYPct = Math.round(bestHypothesis.shiftY * 10000) / 100;

  const shiftAz = Math.round(((bestHypothesis.shiftX * fovWidthDeg)) * 100) / 100;
  const shiftAlt = Math.round(((-bestHypothesis.shiftY * fovHeightDeg)) * 100) / 100;

  const refHfr = bestHypothesis.refHfr > 0
    ? bestHypothesis.refHfr
    : refStars.reduce((acc, s) => acc + s.hfrPx, 0) / refStars.length;
  const testHfr = bestHypothesis.testHfr > 0
    ? bestHypothesis.testHfr
    : testStars.reduce((acc, s) => acc + s.hfrPx, 0) / testStars.length;

  const refHfrRounded = Math.round(refHfr * 100) / 100;
  const testHfrRounded = Math.round(testHfr * 100) / 100;

  let focusStatus: 'sharp' | 'soft' | 'degraded' = 'sharp';
  if (refHfrRounded > 0) {
    const ratio = testHfrRounded / refHfrRounded;
    if (ratio <= 1.15) {
      focusStatus = 'sharp';
    } else if (ratio <= 1.40) {
      focusStatus = 'soft';
    } else {
      focusStatus = 'degraded';
    }
  }

  let instructionSummary = '';
  if (matchedCount >= 3) {
    const rotDir = rotDeg >= 0 ? 'CW' : 'CCW';
    const azDir = shiftAz >= 0 ? 'East (+)' : 'West (-)';
    const altDir = shiftAlt >= 0 ? 'Up (+)' : 'Down (-)';
    instructionSummary = `Matched ${matchedCount} stars. Rotate PA ${Math.abs(rotDeg)}° ${rotDir} | Shift Az ${Math.abs(shiftAz)}° ${azDir}, Alt ${Math.abs(shiftAlt)}° ${altDir} | Focus: ${focusStatus.toUpperCase()} (HFR ${testHfrRounded}px vs Ref ${refHfrRounded}px)`;
  } else {
    instructionSummary = 'No strong asterism match (< 3 stars). Align framing manually.';
  }

  return {
    matchedStarsCount: matchedCount,
    rotationDeltaDeg: rotDeg,
    shiftXPercent: shiftXPct,
    shiftYPercent: shiftYPct,
    shiftAzDeg: shiftAz,
    shiftAltDeg: shiftAlt,
    refAvgHfrPx: refHfrRounded,
    testAvgHfrPx: testHfrRounded,
    focusStatus,
    instructionSummary,
  };
}
