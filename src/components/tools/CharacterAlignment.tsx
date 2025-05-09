'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useFont } from '@/context/FontContext';
import { Button } from '@/components/ui/Button';
import { toast } from "sonner";

const CharacterAlignment: React.FC = () => {
  const { 
    characterMappings, 
    sourceImages,
    fontAdjustments,
    updateFontAdjustments,
    setCharPosition
  } = useFont();
  
  // State variables
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState("AaBbCcDdEe123");
  const [fontSize, setFontSize] = useState(48);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [charPositions, setCharPositions] = useState<Record<string, {x: number, y: number}>>({});
  
  // Character sets
  const upperCaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowerCaseChars = "abcdefghijklmnopqrstuvwxyz";
  const numbersChars = "0123456789";
  const symbolsChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?";
  
  // Canvas references
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Unified character handling
  const allCharsRef = useRef<Record<string, {width: number, height: number, img?: HTMLImageElement}>>({});
  
  // Current drag operation
  const dragRef = useRef<{
    active: boolean,
    char: string,
    startY: number,
    originalY: number
  } | null>(null);
  
  // Initialize with current font adjustments
  useEffect(() => {
    if (fontAdjustments.charPositions) {
      setCharPositions(fontAdjustments.charPositions);
    }
  }, [fontAdjustments.charPositions]);
  
  // Load character images when mappings change
  useEffect(() => {
    if (!characterMappings.length || !sourceImages.length) return;
    
    // Create lookup for source images
    const sourceImageMap = new Map(sourceImages.map(img => [img.id, img]));
    
    // Process each character mapping
    characterMappings.forEach(mapping => {
      if (mapping.char.length !== 1) return;
      
      const sourceImage = sourceImageMap.get(mapping.sourceImageId);
      if (!sourceImage) return;
      
      // Calculate dimensions
      const width = mapping.x2 - mapping.x1;
      const height = mapping.y2 - mapping.y1;
      
      // Store reference info
      if (!allCharsRef.current[mapping.char]) {
        allCharsRef.current[mapping.char] = { width, height };
      }
      
      // Load image if we haven't already
      if (!allCharsRef.current[mapping.char].img) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Extract just the character portion
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw the character
          ctx.drawImage(
            img,
            mapping.x1, mapping.y1, width, height,
            0, 0, width, height
          );
          
          // Create new image from this canvas
          const charImg = new Image();
          charImg.onload = () => {
            allCharsRef.current[mapping.char].img = charImg;
            drawCanvas(); // Redraw when image loads
          };
          charImg.src = canvas.toDataURL('image/png');
        };
        img.src = sourceImage.url;
      }
    });
  }, [characterMappings, sourceImages]);
  
  // Draw the canvas with current character positions
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set up dimensions
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const baselineY = canvasHeight / 2;
    
    // Draw background grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.2)';
      ctx.lineWidth = 1;
      
      // Horizontal lines
      for (let y = 0; y < canvasHeight; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
      
      // Vertical lines
      for (let x = 0; x < canvasWidth; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
    }
    
    // Draw baseline
    if (showBaseline) {
      ctx.strokeStyle = 'rgba(0, 150, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      ctx.lineTo(canvasWidth, baselineY);
      ctx.stroke();
      
      // Label
      ctx.fillStyle = 'rgba(0, 150, 255, 0.9)';
      ctx.font = '14px sans-serif';
      ctx.fillText('Baseline', 10, baselineY - 10);
    }
    
    // Calculate total width for centering
    let totalWidth = 0;
    let charWidths: Record<string, number> = {};
    
    for (let i = 0; i < sampleText.length; i++) {
      const char = sampleText[i];
      const charData = allCharsRef.current[char];
      
      if (charData) {
        const scaledWidth = charData.width * (fontSize / 48);
        charWidths[char] = scaledWidth;
        totalWidth += scaledWidth + fontAdjustments.letterSpacing;
      }
    }
    
    // Start X position (centered)
    let xPos = (canvasWidth - totalWidth) / 2;
    
    // Draw sample text with character adjustments
    for (let i = 0; i < sampleText.length; i++) {
      const char = sampleText[i];
      const charData = allCharsRef.current[char];
      
      if (!charData) {
        xPos += 20; // Space for unknown characters
        continue;
      }
      
      // Get character position adjustment
      const posAdjustment = charPositions[char] || { x: 0, y: fontAdjustments.baselineOffset };
      
      // Calculate scaled dimensions
      const scale = fontSize / 48;
      const scaledWidth = charData.width * scale;
      const scaledHeight = charData.height * scale;
      
      // Calculate position
      const yPos = baselineY - scaledHeight + posAdjustment.y * scale;
      
      // Highlight selected characters
      const isSelected = char === selectedChar;
      
      // Draw character bounding box
      ctx.strokeStyle = isSelected 
        ? 'rgba(255, 100, 100, 0.8)' 
        : posAdjustment.y !== fontAdjustments.baselineOffset 
          ? 'rgba(0, 180, 0, 0.5)' 
          : 'rgba(200, 200, 200, 0.3)';
      
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(xPos, yPos, scaledWidth, scaledHeight);
      
      // Draw character
      if (charData.img) {
        ctx.drawImage(
          charData.img,
          xPos, yPos,
          scaledWidth, scaledHeight
        );
      } else {
        // Fallback to text
        ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillText(char, xPos, baselineY);
      }
      
      // Draw position indicator for selected or custom positioned characters
      if (isSelected || posAdjustment.y !== fontAdjustments.baselineOffset) {
        // Draw indicator line to baseline
        ctx.strokeStyle = isSelected ? 'rgba(255, 100, 100, 0.5)' : 'rgba(0, 180, 0, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xPos + scaledWidth / 2, yPos + scaledHeight);
        ctx.lineTo(xPos + scaledWidth / 2, baselineY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Show position value
        ctx.fillStyle = isSelected ? 'rgba(255, 100, 100, 0.9)' : 'rgba(0, 180, 0, 0.9)';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${Math.round(posAdjustment.y)}px`, xPos + scaledWidth / 2 - 10, yPos - 4);
      }
      
      // Draw drag handle for selected character
      if (isSelected) {
        // Draw a little handle at the bottom center
        ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
        ctx.beginPath();
        ctx.arc(xPos + scaledWidth / 2, yPos + scaledHeight + 10, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw arrow
        ctx.beginPath();
        ctx.moveTo(xPos + scaledWidth / 2, yPos + scaledHeight + 5);
        ctx.lineTo(xPos + scaledWidth / 2, yPos + scaledHeight + 15);
        ctx.stroke();
        
        // Draw arrow heads
        ctx.beginPath();
        ctx.moveTo(xPos + scaledWidth / 2 - 4, yPos + scaledHeight + 8);
        ctx.lineTo(xPos + scaledWidth / 2, yPos + scaledHeight + 5);
        ctx.lineTo(xPos + scaledWidth / 2 + 4, yPos + scaledHeight + 8);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(xPos + scaledWidth / 2 - 4, yPos + scaledHeight + 12);
        ctx.lineTo(xPos + scaledWidth / 2, yPos + scaledHeight + 15);
        ctx.lineTo(xPos + scaledWidth / 2 + 4, yPos + scaledHeight + 12);
        ctx.stroke();
      }
      
      // Move to next character position
      xPos += scaledWidth + fontAdjustments.letterSpacing;
    }
    
    // Draw legend
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    
    const customPositionedCount = Object.keys(charPositions)
      .filter(c => charPositions[c].y !== fontAdjustments.baselineOffset).length;
    
    if (customPositionedCount > 0) {
      ctx.fillStyle = 'rgba(0, 180, 0, 0.8)';
      ctx.fillText(`${customPositionedCount} character(s) with custom position`, 20, canvasHeight - 20);
    }
  };
  
  // Resize canvas when window resizes
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.clientWidth;
        canvasRef.current.height = 400;
        drawCanvas();
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial sizing
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Draw canvas when relevant state changes
  useEffect(() => {
    drawCanvas();
  }, [
    selectedChar, 
    sampleText, 
    fontSize, 
    showBaseline, 
    showGrid, 
    fontAdjustments.letterSpacing,
    fontAdjustments.baselineOffset,
    charPositions
  ]);
  
  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const baselineY = canvas.height / 2;
    
    // Calculate position for each character
    let xPos = (canvas.width - calculateTotalWidth()) / 2;
    
    for (let i = 0; i < sampleText.length; i++) {
      const char = sampleText[i];
      const charData = allCharsRef.current[char];
      
      if (!charData) {
        xPos += 20;
        continue;
      }
      
      // Get character position adjustment
      const posAdjustment = charPositions[char] || { x: 0, y: fontAdjustments.baselineOffset };
      
      // Calculate scaled dimensions
      const scale = fontSize / 48;
      const scaledWidth = charData.width * scale;
      const scaledHeight = charData.height * scale;
      
      // Calculate position
      const yPos = baselineY - scaledHeight + posAdjustment.y * scale;
      
      // Check if we clicked on this character
      if (
        mouseX >= xPos && mouseX <= xPos + scaledWidth &&
        mouseY >= yPos && mouseY <= yPos + scaledHeight
      ) {
        setSelectedChar(char);
        break;
      }
      
      // Check if we clicked on the character's drag handle
      if (char === selectedChar) {
        const handleX = xPos + scaledWidth / 2;
        const handleY = yPos + scaledHeight + 10;
        
        if (
          mouseX >= handleX - 10 && mouseX <= handleX + 10 &&
          mouseY >= handleY - 10 && mouseY <= handleY + 10
        ) {
          // Start dragging
          dragRef.current = {
            active: true,
            char,
            startY: mouseY,
            originalY: posAdjustment.y
          };
          break;
        }
      }
      
      // Move to next character position
      xPos += scaledWidth + fontAdjustments.letterSpacing;
    }
  };
  
  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current?.active) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseY = e.clientY - rect.left;
    
    // Calculate movement
    const deltaY = mouseY - dragRef.current.startY;
    
    // Scale movement based on font size
    const scale = 48 / fontSize;
    const newY = dragRef.current.originalY + deltaY * scale;
    
    // Update position
    setCharPositions(prev => ({
      ...prev,
      [dragRef.current!.char]: { x: 0, y: newY }
    }));
  };
  
  // Handle mouse up
  const handleMouseUp = () => {
    if (dragRef.current?.active) {
      // Save the final position to font context
      const char = dragRef.current.char;
      const pos = charPositions[char];
      
      if (pos) {
        setCharPosition(char, pos.x, pos.y);
        toast.success(`Updated position for '${char}'`);
      }
      
      dragRef.current = null;
    }
  };
  
  // Helper to calculate total width of sample text
  const calculateTotalWidth = () => {
    let totalWidth = 0;
    
    for (let i = 0; i < sampleText.length; i++) {
      const char = sampleText[i];
      const charData = allCharsRef.current[char];
      
      if (charData) {
        const scale = fontSize / 48;
        totalWidth += charData.width * scale + fontAdjustments.letterSpacing;
      } else {
        totalWidth += 20; // Space for unknown characters
      }
    }
    
    return totalWidth;
  };
  
  // Apply global baseline adjustment
  const applyGlobalBaseline = (value: number) => {
    updateFontAdjustments({ baselineOffset: value });
  };
  
  // Apply global letter spacing
  const applyLetterSpacing = (value: number) => {
    updateFontAdjustments({ letterSpacing: value });
  };
  
  // Apply global baseline to all characters
  const alignAllToBaseline = () => {
    // Update all characters to use the global baseline
    const updatedPositions = Object.fromEntries(
      Object.entries(charPositions).map(([char, pos]) => [
        char, 
        { ...pos, y: fontAdjustments.baselineOffset }
      ])
    );
    
    setCharPositions(updatedPositions);
    updateFontAdjustments({ 
      charPositions: updatedPositions
    });
    
    toast.success('Aligned all characters to baseline');
  };
  
  // Reset all character positions
  const resetAllPositions = () => {
    setCharPositions({});
    updateFontAdjustments({ 
      charPositions: {} 
    });
    
    toast.success('Reset all character positions');
  };
  
  // Apply current baseline to selected character
  const alignSelectedToBaseline = () => {
    if (!selectedChar) return;
    
    // Update the selected character to use the global baseline
    const updatedPositions = {
      ...charPositions,
      [selectedChar]: { x: 0, y: fontAdjustments.baselineOffset }
    };
    
    setCharPositions(updatedPositions);
    updateFontAdjustments({ 
      charPositions: updatedPositions
    });
    
    toast.success(`Aligned '${selectedChar}' to baseline`);
  };
  
  // --- Automation: Balance Font ---
  const balanceFont = () => {
    // 1. Align all to baseline
    const newCharPositions = { ...charPositions };
    Object.keys(allCharsRef.current).forEach(char => {
      newCharPositions[char] = { x: 0, y: fontAdjustments.baselineOffset };
    });

    // 2. Normalize x-height for lowercase letters
    const lowerCaseHeights = lowerCaseChars.split('').map(char => allCharsRef.current[char]?.height).filter(Boolean);
    const avgXHeight = lowerCaseHeights.length > 0 ? lowerCaseHeights.reduce((a, b) => a + b, 0) / lowerCaseHeights.length : null;
    if (avgXHeight) {
      lowerCaseChars.split('').forEach(char => {
        if (allCharsRef.current[char]) {
          // Adjust y so that the bottom of the char aligns with baseline and height matches avgXHeight
          // (Assume y=0 is baseline, so y = baseline - (height - avgXHeight))
          const diff = allCharsRef.current[char].height - avgXHeight;
          newCharPositions[char] = { x: 0, y: fontAdjustments.baselineOffset + diff / 2 };
        }
      });
    }

    // 3. Generate default kerning pairs (simple AV, To, etc.)
    const defaultKerningPairs = {
      'AV': -2,
      'To': -1,
      'Wa': -1,
      'Yo': -1,
      'LT': -1,
      'FA': -1,
      'PA': -1,
      'Ta': -1,
      'LA': -1,
      'VA': -2,
      'AT': -1,
      'LY': -1,
      'Ty': -1,
      'AY': -1,
      'AW': -1,
      'YA': -1,
      'OV': -1,
      'OA': -1,
      'OO': -1,
      'OP': -1,
      'OC': -1,
      'OG': -1,
      'QO': -1,
      'QY': -1,
      'QW': -1,
      'QJ': -1,
      'QG': -1,
      'QH': -1,
      'QK': -1,
      'QZ': -1,
      'QX': -1,
      'QF': -1
    };
    updateFontAdjustments({
      charPositions: newCharPositions,
      kerningPairs: defaultKerningPairs
    });
    setCharPositions(newCharPositions);
    toast.success('Font balanced: baseline, x-height, and kerning applied!');
  };
  
  // Component for character sets
  const CharacterSetSelector = ({ title, chars }: { title: string, chars: string }) => (
    <div className="mt-2">
      <h4 className="text-sm font-medium mb-1">{title}</h4>
      <div className="flex flex-wrap gap-1">
        {chars.split('').map(char => {
          const isAvailable = char in allCharsRef.current;
          const isSelected = char === selectedChar;
          const hasCustomPosition = charPositions[char]?.y !== fontAdjustments.baselineOffset;
          
          return (
            <button
              key={char}
              className={`
                w-8 h-8 flex items-center justify-center rounded text-base
                ${isAvailable 
                  ? 'bg-white border hover:bg-gray-50' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'}
                ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : ''}
                ${hasCustomPosition && !isSelected ? 'border-green-500 text-green-600' : ''}
              `}
              onClick={() => isAvailable && setSelectedChar(char)}
              disabled={!isAvailable}
            >
              {char}
            </button>
          );
        })}
      </div>
    </div>
  );
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium">Character Alignment</h3>
          <p className="text-sm text-gray-500">
            Adjust the vertical position of characters for proper baseline alignment.
          </p>
        </div>
        <div className="space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={alignAllToBaseline}
          >
            Align All
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={resetAllPositions}
          >
            Reset All
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={balanceFont}
          >
            Balance Font
          </Button>
        </div>
      </div>
      
      <div className="bg-white border rounded-lg shadow-sm p-4">
        <canvas 
          ref={canvasRef}
          className="w-full h-[400px] border rounded cursor-pointer"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">Global Adjustments</h4>
          
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm text-gray-600">Baseline Offset</label>
              <span className="text-sm font-medium">{fontAdjustments.baselineOffset}px</span>
            </div>
            <input 
              type="range" 
              min="-50" 
              max="50" 
              value={fontAdjustments.baselineOffset} 
              onChange={(e) => applyGlobalBaseline(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm text-gray-600">Letter Spacing</label>
              <span className="text-sm font-medium">{fontAdjustments.letterSpacing}px</span>
            </div>
            <input 
              type="range" 
              min="-10" 
              max="30" 
              value={fontAdjustments.letterSpacing} 
              onChange={(e) => applyLetterSpacing(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm text-gray-600">Preview Font Size</label>
              <span className="text-sm font-medium">{fontSize}px</span>
            </div>
            <input 
              type="range" 
              min="24" 
              max="96" 
              value={fontSize} 
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showBaseline}
                onChange={() => setShowBaseline(!showBaseline)}
                className="rounded"
              />
              <span className="text-sm">Show Baseline</span>
            </label>
            
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={() => setShowGrid(!showGrid)}
                className="rounded"
              />
              <span className="text-sm">Show Grid</span>
            </label>
          </div>
        </div>
        
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">Selected Character</h4>
          
          {selectedChar ? (
            <>
              <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
                <span className="text-6xl">{selectedChar}</span>
              </div>
              
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-sm text-gray-600">Vertical Position</label>
                  <span className="text-sm font-medium">
                    {(charPositions[selectedChar]?.y || fontAdjustments.baselineOffset)}px
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-50" 
                  max="50" 
                  value={charPositions[selectedChar]?.y || fontAdjustments.baselineOffset} 
                  onChange={(e) => {
                    const newY = Number(e.target.value);
                    setCharPositions(prev => ({
                      ...prev,
                      [selectedChar]: { x: 0, y: newY }
                    }));
                  }}
                  className="w-full"
                />
              </div>
              
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={alignSelectedToBaseline}
                >
                  Align to Baseline
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // Save the position permanently
                    const pos = charPositions[selectedChar];
                    if (pos) {
                      setCharPosition(selectedChar, pos.x, pos.y);
                      toast.success(`Saved position for '${selectedChar}'`);
                    }
                  }}
                >
                  Save Position
                </Button>
              </div>
              
              <p className="text-sm text-gray-500 italic">
                Tip: You can also drag the handle below the character to adjust its position.
              </p>
            </>
          ) : (
            <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
              Select a character to adjust its position
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 border rounded-lg">
        <div className="flex justify-between mb-2">
          <h4 className="font-medium">Preview Text</h4>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setSampleText("The quick brown fox jumps over the lazy dog 1234567890")}
          >
            Pangram
          </Button>
        </div>
        <input
          type="text"
          value={sampleText}
          onChange={(e) => setSampleText(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Enter text to preview alignment..."
        />
      </div>
      
      <div className="p-4 border rounded-lg">
        <h4 className="font-medium mb-2">Character Sets</h4>
        
        <CharacterSetSelector title="Uppercase" chars={upperCaseChars} />
        <CharacterSetSelector title="Lowercase" chars={lowerCaseChars} />
        <CharacterSetSelector title="Numbers" chars={numbersChars} />
        <CharacterSetSelector title="Symbols" chars={symbolsChars} />
      </div>
    </div>
  );
};

export default CharacterAlignment; 