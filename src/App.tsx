import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PRESETS = [16, 32, 48, 64, 128] as const;
const GROUP_TARGETS = [8, 16, 24, 32, 48, 64] as const;
const MIN_GRID = 8;
const MAX_GRID = 160;

type SourceImage = {
  element: HTMLImageElement;
  fileName: string;
  width: number;
  height: number;
  objectUrl: string;
};

type GridAxis = 'width' | 'height';
type ColorDisplayMode = 'exact' | 'grouped';

type ColorCount = {
  key: string;
  label: string;
  cssColor: string;
  count: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

type ColorGroup = {
  key: string;
  label: string;
  cssColor: string;
  count: number;
  colors: ColorCount[];
  alpha: number;
};

type ColorCenter = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

function MosaicrispMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 64 64"
      role="img"
      aria-label="Mosaicrisp logo"
    >
      <rect className="brand-mark-bg" width="64" height="64" rx="14" />
      <g className="brand-mark-corners" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.6">
        <path d="M47 13h7v7" />
        <path d="M54 44v7h-7" />
      </g>
      <g className="brand-mark-tiles">
        <rect x="12" y="12" width="8" height="8" rx="1.4" />
        <rect x="22" y="12" width="8" height="8" rx="1.4" />
        <rect x="32" y="12" width="8" height="8" rx="1.4" />
        <rect x="12" y="22" width="8" height="8" rx="1.4" />
        <rect x="22" y="22" width="8" height="8" rx="1.4" />
        <rect x="12" y="32" width="8" height="8" rx="1.4" />
        <rect x="22" y="32" width="8" height="8" rx="1.4" />
        <rect x="32" y="32" width="8" height="8" rx="1.4" />
        <rect x="12" y="42" width="8" height="8" rx="1.4" />
        <rect x="22" y="42" width="8" height="8" rx="1.4" />
      </g>
      <g className="brand-mark-sparks">
        <rect x="38" y="23" width="5" height="5" rx="1" />
        <rect x="46" y="31" width="4" height="4" rx="0.8" />
        <rect x="37" y="43" width="4.5" height="4.5" rx="0.9" />
      </g>
      <path
        className="brand-mark-star"
        d="M43.6 26.2c1.4 5.7 3.8 8.1 9.5 9.5-5.7 1.4-8.1 3.8-9.5 9.5-1.4-5.7-3.8-8.1-9.5-9.5 5.7-1.4 8.1-3.8 9.5-9.5Z"
      />
    </svg>
  );
}

const SIDE_NAV_ITEMS = [
  { label: '画像', icon: '▧' },
  { label: 'プリセット', icon: '▦' },
  { label: 'グリッド', icon: '⌗' },
  { label: '色', icon: '●' },
  { label: '出力', icon: '↓' },
] as const;

function clampGrid(value: number): number {
  return Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(value)));
}

function calculateLockedGrid(
  changedAxis: GridAxis,
  nextValue: number,
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, imageWidth);
  const safeHeight = Math.max(1, imageHeight);
  const value = clampGrid(nextValue);

  if (changedAxis === 'width') {
    return {
      width: value,
      height: clampGrid((value * safeHeight) / safeWidth),
    };
  }

  return {
    width: clampGrid((value * safeWidth) / safeHeight),
    height: value,
  };
}

function getPreviewCellSize(width: number, height: number): number {
  const longestSide = Math.max(width, height);
  return Math.min(28, Math.max(3, Math.floor(680 / longestSide)));
}

function toHexChannel(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function getColorLabel(red: number, green: number, blue: number, alpha: number): string {
  if (alpha === 0) {
    return 'transparent';
  }

  if (alpha === 255) {
    return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(2)})`;
}

function getColorCounts(imageData: ImageData): ColorCount[] {
  const counts = new Map<string, ColorCount>();

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const alpha = imageData.data[index + 3];
    const isTransparent = alpha === 0;
    const key = isTransparent ? 'transparent' : `${red},${green},${blue},${alpha}`;
    const label = getColorLabel(red, green, blue, alpha);
    const cssColor = isTransparent ? 'transparent' : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
    const current = counts.get(key);

    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        key,
        label,
        cssColor,
        count: 1,
        red,
        green,
        blue,
        alpha,
      });
    }
  }

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.label.localeCompare(right.label);
  });
}

function getColorDistance(color: ColorCount, center: ColorCenter): number {
  const redDistance = color.red - center.red;
  const greenDistance = color.green - center.green;
  const blueDistance = color.blue - center.blue;
  const alphaDistance = color.alpha - center.alpha;

  return (
    redDistance * redDistance
    + greenDistance * greenDistance
    + blueDistance * blueDistance
    + alphaDistance * alphaDistance
  );
}

function getNearestCenterIndex(color: ColorCount, centers: ColorCenter[]): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  centers.forEach((center, index) => {
    const distance = getColorDistance(color, center);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function chooseInitialCenters(colors: ColorCount[], targetCount: number): ColorCenter[] {
  if (colors.length === 0) {
    return [];
  }

  const centers: ColorCenter[] = [{
    red: colors[0].red,
    green: colors[0].green,
    blue: colors[0].blue,
    alpha: colors[0].alpha,
  }];

  while (centers.length < targetCount && centers.length < colors.length) {
    let nextColor = colors[0];
    let bestScore = -1;

    colors.forEach((color) => {
      const nearestDistance = getColorDistance(color, centers[getNearestCenterIndex(color, centers)]);
      const score = nearestDistance * Math.sqrt(color.count);

      if (score > bestScore) {
        bestScore = score;
        nextColor = color;
      }
    });

    centers.push({
      red: nextColor.red,
      green: nextColor.green,
      blue: nextColor.blue,
      alpha: nextColor.alpha,
    });
  }

  return centers;
}

function getGroupedColorCounts(colorCounts: ColorCount[], targetCount: number): ColorGroup[] {
  const transparentColor = colorCounts.find((color) => color.key === 'transparent');
  const opaqueColors = colorCounts.filter((color) => color.key !== 'transparent');
  const safeTargetCount = Math.max(1, Math.min(targetCount, opaqueColors.length));

  if (opaqueColors.length === 0) {
    return transparentColor
      ? [{
        key: 'group-transparent',
        label: 'transparent',
        cssColor: 'transparent',
        count: transparentColor.count,
        colors: [transparentColor],
        alpha: 0,
      }]
      : [];
  }

  let centers = chooseInitialCenters(opaqueColors, safeTargetCount);
  let buckets: ColorCount[][] = [];

  for (let iteration = 0; iteration < 7; iteration += 1) {
    buckets = Array.from({ length: centers.length }, () => []);

    opaqueColors.forEach((color) => {
      buckets[getNearestCenterIndex(color, centers)].push(color);
    });

    centers = centers.map((center, index) => {
      const bucket = buckets[index];
      if (!bucket || bucket.length === 0) {
        return center;
      }

      const totals = bucket.reduce(
        (result, color) => ({
          count: result.count + color.count,
          red: result.red + color.red * color.count,
          green: result.green + color.green * color.count,
          blue: result.blue + color.blue * color.count,
          alpha: result.alpha + color.alpha * color.count,
        }),
        { count: 0, red: 0, green: 0, blue: 0, alpha: 0 },
      );

      return {
        red: totals.red / totals.count,
        green: totals.green / totals.count,
        blue: totals.blue / totals.count,
        alpha: totals.alpha / totals.count,
      };
    });
  }

  buckets = Array.from({ length: centers.length }, () => []);
  opaqueColors.forEach((color) => {
    buckets[getNearestCenterIndex(color, centers)].push(color);
  });

  const groups = buckets
    .filter((bucket) => bucket.length > 0)
    .map((bucket, index) => {
      const totals = bucket.reduce(
        (result, color) => ({
          count: result.count + color.count,
          red: result.red + color.red * color.count,
          green: result.green + color.green * color.count,
          blue: result.blue + color.blue * color.count,
          alpha: result.alpha + color.alpha * color.count,
        }),
        { count: 0, red: 0, green: 0, blue: 0, alpha: 0 },
      );
      const red = Math.round(totals.red / totals.count);
      const green = Math.round(totals.green / totals.count);
      const blue = Math.round(totals.blue / totals.count);
      const alpha = Math.round(totals.alpha / totals.count);

      return {
        key: `group-${index}-${red}-${green}-${blue}-${alpha}`,
        label: getColorLabel(red, green, blue, alpha),
        cssColor: `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`,
        count: totals.count,
        colors: bucket.sort((left, right) => right.count - left.count),
        alpha,
      };
    });

  if (transparentColor) {
    groups.push({
      key: 'group-transparent',
      label: 'transparent',
      cssColor: 'transparent',
      count: transparentColor.count,
      colors: [transparentColor],
      alpha: 0,
    });
  }

  return groups.sort((left, right) => right.count - left.count);
}

function drawPixelArt(
  image: HTMLImageElement,
  gridWidth: number,
  gridHeight: number,
  previewCanvas: HTMLCanvasElement,
  exportCanvas: HTMLCanvasElement,
  showGridLines: boolean,
): ColorCount[] {
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = gridWidth;
  sampleCanvas.height = gridHeight;

  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sampleContext) {
    throw new Error('Canvas context could not be created.');
  }

  sampleContext.clearRect(0, 0, gridWidth, gridHeight);
  sampleContext.imageSmoothingEnabled = true;
  sampleContext.imageSmoothingQuality = 'high';
  sampleContext.drawImage(image, 0, 0, gridWidth, gridHeight);

  const imageData = sampleContext.getImageData(0, 0, gridWidth, gridHeight);

  exportCanvas.width = gridWidth;
  exportCanvas.height = gridHeight;
  const exportContext = exportCanvas.getContext('2d');
  if (!exportContext) {
    throw new Error('Export canvas context could not be created.');
  }
  exportContext.clearRect(0, 0, gridWidth, gridHeight);
  exportContext.putImageData(imageData, 0, 0);

  const cellSize = getPreviewCellSize(gridWidth, gridHeight);
  previewCanvas.width = gridWidth * cellSize;
  previewCanvas.height = gridHeight * cellSize;

  const previewContext = previewCanvas.getContext('2d');
  if (!previewContext) {
    throw new Error('Preview canvas context could not be created.');
  }

  previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewContext.imageSmoothingEnabled = false;

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const index = (y * gridWidth + x) * 4;
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      const alpha = imageData.data[index + 3] / 255;

      if (alpha === 0) {
        continue;
      }

      previewContext.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      previewContext.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  if (showGridLines) {
    previewContext.save();
    previewContext.strokeStyle = 'rgba(32, 33, 36, 0.28)';
    previewContext.lineWidth = 1;

    for (let x = 0; x <= gridWidth; x += 1) {
      const position = x * cellSize + 0.5;
      previewContext.beginPath();
      previewContext.moveTo(position, 0);
      previewContext.lineTo(position, previewCanvas.height);
      previewContext.stroke();
    }

    for (let y = 0; y <= gridHeight; y += 1) {
      const position = y * cellSize + 0.5;
      previewContext.beginPath();
      previewContext.moveTo(0, position);
      previewContext.lineTo(previewCanvas.width, position);
      previewContext.stroke();
    }

    previewContext.restore();
  }

  return getColorCounts(imageData);
}

function App() {
  const [sourceImage, setSourceImage] = useState<SourceImage | null>(null);
  const [gridWidth, setGridWidth] = useState(32);
  const [gridHeight, setGridHeight] = useState(32);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [showGridLines, setShowGridLines] = useState(false);
  const [colorCounts, setColorCounts] = useState<ColorCount[]>([]);
  const [colorDisplayMode, setColorDisplayMode] = useState<ColorDisplayMode>('grouped');
  const [groupTargetCount, setGroupTargetCount] = useState(24);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const activePreset = useMemo(() => {
    if (gridWidth !== gridHeight) {
      return null;
    }
    return PRESETS.find((preset) => preset === gridWidth) ?? null;
  }, [gridHeight, gridWidth]);

  const outputLabel = sourceImage
    ? `${gridWidth} x ${gridHeight} px`
    : '画像を選択してください';
  const totalPixels = gridWidth * gridHeight;
  const transparentCount = colorCounts.find((color) => color.key === 'transparent')?.count ?? 0;
  const groupedColorCounts = useMemo(
    () => getGroupedColorCounts(colorCounts, groupTargetCount),
    [colorCounts, groupTargetCount],
  );
  const exactColorGroups = useMemo<ColorGroup[]>(
    () => colorCounts.map((color) => ({
      key: `exact-${color.key}`,
      label: color.label,
      cssColor: color.cssColor,
      count: color.count,
      colors: [color],
      alpha: color.alpha,
    })),
    [colorCounts],
  );
  const displayedColorGroups = colorDisplayMode === 'grouped' ? groupedColorCounts : exactColorGroups;
  const colorSummary = colorDisplayMode === 'grouped'
    ? `${groupedColorCounts.length}グループ / ${colorCounts.length}色 / ${totalPixels}セル`
    : `${colorCounts.length}色 / ${totalPixels}セル`;

  const toggleExpandedGroup = useCallback((groupKey: string) => {
    setExpandedGroupKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(groupKey)) {
        nextKeys.delete(groupKey);
      } else {
        nextKeys.add(groupKey);
      }
      return nextKeys;
    });
  }, []);

  const applyGridChange = useCallback(
    (axis: GridAxis, value: number) => {
      if (lockAspectRatio && sourceImage) {
        const nextGrid = calculateLockedGrid(axis, value, sourceImage.width, sourceImage.height);
        setGridWidth(nextGrid.width);
        setGridHeight(nextGrid.height);
        return;
      }

      if (axis === 'width') {
        setGridWidth(clampGrid(value));
      } else {
        setGridHeight(clampGrid(value));
      }
    },
    [lockAspectRatio, sourceImage],
  );

  const applyPreset = useCallback(
    (preset: number) => {
      if (lockAspectRatio && sourceImage) {
        const nextGrid = calculateLockedGrid('width', preset, sourceImage.width, sourceImage.height);
        setGridWidth(nextGrid.width);
        setGridHeight(nextGrid.height);
        return;
      }

      setGridWidth(preset);
      setGridHeight(preset);
    },
    [lockAspectRatio, sourceImage],
  );

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setErrorMessage('画像ファイルを選択してください。');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;

    try {
      await image.decode();

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = objectUrl;

      setSourceImage({
        element: image,
        fileName: file.name,
        width: image.naturalWidth,
        height: image.naturalHeight,
        objectUrl,
      });
      setErrorMessage(null);

      if (lockAspectRatio) {
        const nextGrid = calculateLockedGrid('width', gridWidth, image.naturalWidth, image.naturalHeight);
        setGridWidth(nextGrid.width);
        setGridHeight(nextGrid.height);
      }
    } catch {
      URL.revokeObjectURL(objectUrl);
      setErrorMessage('画像を読み込めませんでした。別の画像で試してください。');
    }
  };

  const handleDownload = () => {
    const canvas = exportCanvasRef.current;
    if (!canvas || !sourceImage) {
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setErrorMessage('PNGの作成に失敗しました。');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mosaicrisp-${gridWidth}x${gridHeight}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }, 'image/png');
  };

  useEffect(() => {
    const previewCanvas = previewCanvasRef.current;
    const exportCanvas = exportCanvasRef.current;
    if (!sourceImage || !previewCanvas || !exportCanvas) {
      setColorCounts([]);
      return;
    }

    setIsRendering(true);

    try {
      const nextColorCounts = drawPixelArt(
        sourceImage.element,
        gridWidth,
        gridHeight,
        previewCanvas,
        exportCanvas,
        showGridLines,
      );
      setColorCounts(nextColorCounts);
      setErrorMessage(null);
    } catch {
      setColorCounts([]);
      setErrorMessage('プレビューの描画に失敗しました。');
    } finally {
      setIsRendering(false);
    }
  }, [gridHeight, gridWidth, showGridLines, sourceImage]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="app-topbar" aria-labelledby="app-title">
        <div className="brand-lockup">
          <MosaicrispMark />
          <div>
            <p className="eyebrow">ローカル画像ドット絵ツール</p>
            <h1 id="app-title">Mosaicrisp</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <span aria-hidden="true">▧</span>
            画像を選択
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={handleDownload}
            disabled={!sourceImage}
            title="PNGとしてダウンロード"
          >
            <span aria-hidden="true">↓</span>
            PNG
          </button>
        </div>
      </header>

      <div className="tool-layout">
        <nav className="side-toolbar" aria-label="主要ツール">
          {SIDE_NAV_ITEMS.map((item, index) => (
            <button
              key={item.label}
              className={index === 0 ? 'side-tool active' : 'side-tool'}
              type="button"
              title={item.label}
              aria-label={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
            </button>
          ))}
        </nav>

        <aside className="control-panel" aria-label="変換設定">
          <div className="upload-box">
            <input
              ref={fileInputRef}
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            <label htmlFor="image-upload">
              <span className="upload-icon" aria-hidden="true">+</span>
              画像を選択
            </label>
            {sourceImage ? (
              <div className="file-meta">
                <strong>{sourceImage.fileName}</strong>
                <span>
                  {sourceImage.width} x {sourceImage.height} px
                </span>
              </div>
            ) : (
              <p>PNG / JPEG / WebP などをローカルで読み込みます。</p>
            )}
          </div>

          <details className="advanced-settings">
            <summary>
              <span>変換設定</span>
              <span>{activePreset ? `${activePreset}x${activePreset}` : `${gridWidth} x ${gridHeight}`}</span>
            </summary>

            <div className="advanced-settings-content">
              <div className="control-group">
                <div className="group-heading">
                  <h2>プリセット</h2>
                  <span>{activePreset ? `${activePreset}x${activePreset}` : 'カスタム'}</span>
                </div>
                <div className="preset-grid">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      className={activePreset === preset ? 'preset-button active' : 'preset-button'}
                      type="button"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group">
                <div className="group-heading">
                  <h2>グリッド</h2>
                  <span>{gridWidth} x {gridHeight}</span>
                </div>
                <label className="range-row">
                  <span>幅</span>
                  <input
                    type="range"
                    min={MIN_GRID}
                    max={MAX_GRID}
                    value={gridWidth}
                    onChange={(event) => applyGridChange('width', Number(event.target.value))}
                  />
                  <output>{gridWidth}</output>
                </label>
                <label className="range-row">
                  <span>高さ</span>
                  <input
                    type="range"
                    min={MIN_GRID}
                    max={MAX_GRID}
                    value={gridHeight}
                    onChange={(event) => applyGridChange('height', Number(event.target.value))}
                  />
                  <output>{gridHeight}</output>
                </label>
              </div>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={lockAspectRatio}
                  onChange={(event) => setLockAspectRatio(event.target.checked)}
                />
                <span>アスペクト比を固定</span>
              </label>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={showGridLines}
                  onChange={(event) => setShowGridLines(event.target.checked)}
                />
                <span>グリッド線を表示</span>
              </label>
            </div>
          </details>

          {errorMessage ? <p className="error-message" role="alert">{errorMessage}</p> : null}
        </aside>

        <section className="preview-panel" aria-label="ドット絵プレビュー">
          <div className="preview-toolbar">
            <div>
              <h2>プレビュー</h2>
              <span>{outputLabel}</span>
            </div>
            <div className="render-status" aria-live="polite">
              {isRendering ? '描画中' : sourceImage ? '準備完了' : '未選択'}
            </div>
          </div>

          <div className={sourceImage ? 'preview-stage has-image' : 'preview-stage'}>
            {!sourceImage ? (
              <div className="empty-state">
                <strong>画像を選ぶとここにプレビューが表示されます。</strong>
                <span>グリッド数を変えると、その場で再描画されます。</span>
              </div>
            ) : null}
            <canvas ref={previewCanvasRef} aria-label="ドット絵化したプレビュー" />
          </div>

          <canvas ref={exportCanvasRef} className="export-canvas" aria-hidden="true" />
        </section>

        <aside className="color-panel" aria-label="プレビュー内の色数">
          <div className="color-panel-heading">
            <div>
              <h2>色</h2>
              <span>
                {sourceImage
                  ? colorSummary
                  : '画像選択後に集計します'}
              </span>
            </div>
            {sourceImage ? (
              <span className="transparent-count">透明 {transparentCount}</span>
            ) : null}
          </div>

          {sourceImage && colorCounts.length > 0 ? (
            <>
              <div className="color-controls">
                <div className="segmented-control" aria-label="カラー表示モード">
                  <button
                    className={colorDisplayMode === 'grouped' ? 'active' : ''}
                    type="button"
                    onClick={() => setColorDisplayMode('grouped')}
                  >
                    Grouped
                  </button>
                  <button
                    className={colorDisplayMode === 'exact' ? 'active' : ''}
                    type="button"
                    onClick={() => setColorDisplayMode('exact')}
                  >
                    Exact
                  </button>
                </div>

                {colorDisplayMode === 'grouped' ? (
                  <label className="group-target-row">
                    <span>目標</span>
                    <select
                      value={groupTargetCount}
                      onChange={(event) => {
                        setGroupTargetCount(Number(event.target.value));
                        setExpandedGroupKeys(new Set());
                      }}
                    >
                      {GROUP_TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {target}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="color-list">
                <div className="color-list-header" aria-hidden="true">
                  <span>色</span>
                  <span>セル</span>
                  <span>割合</span>
                  <span>内包</span>
                  <span>操作</span>
                </div>
                {displayedColorGroups.map((group) => {
                  const isExpanded = expandedGroupKeys.has(group.key);
                  const canExpand = colorDisplayMode === 'grouped' && group.colors.length > 1;
                  const colorRowContent = (
                    <>
                      <span
                        className={group.alpha === 0 ? 'color-swatch transparent' : 'color-swatch'}
                        style={{ backgroundColor: group.cssColor }}
                        aria-hidden="true"
                      />
                      <span className="color-label">{group.label}</span>
                      <span className="color-count">{group.count}</span>
                      <span className="color-percent">
                        {((group.count / totalPixels) * 100).toFixed(1)}%
                      </span>
                      <span className="color-contained">
                        {canExpand ? `${group.colors.length}色` : ''}
                      </span>
                      <span className="color-expand">{canExpand ? (isExpanded ? '閉じる' : '内訳') : ''}</span>
                    </>
                  );

                  return (
                    <div className="color-group" key={group.key}>
                      {canExpand ? (
                        <button
                          className="color-row color-row-button"
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => {
                            toggleExpandedGroup(group.key);
                          }}
                        >
                          {colorRowContent}
                        </button>
                      ) : (
                        <div className="color-row">
                          {colorRowContent}
                        </div>
                      )}

                      {isExpanded ? (
                        <div className="nested-color-list">
                          {group.colors.map((color) => (
                            <div className="nested-color-row" key={color.key}>
                              <span
                                className={color.alpha === 0 ? 'color-swatch transparent' : 'color-swatch'}
                                style={{ backgroundColor: color.cssColor }}
                                aria-hidden="true"
                              />
                              <span className="color-label">{color.label}</span>
                              <span className="color-count">{color.count}</span>
                              <span className="color-percent">
                                {((color.count / totalPixels) * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="color-note">プレビューに描画されたセル色をカウントします。</p>
          )}
        </aside>
      </div>
    </main>
  );
}

export default App;
