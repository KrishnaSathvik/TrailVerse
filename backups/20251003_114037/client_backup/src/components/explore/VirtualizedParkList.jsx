import React from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import ParkCard from './ParkCard';

const VirtualizedParkList = ({ parks, onSave, savedParks = [] }) => {
  const COLUMN_WIDTH = 350;
  const ROW_HEIGHT = 450;
  const GAP = 24;

  const Cell = ({ columnIndex, rowIndex, style, data }) => {
    const { parks, columnCount } = data;
    const index = rowIndex * columnCount + columnIndex;
    
    if (index >= parks.length) return null;
    
    const park = parks[index];
    const isSaved = savedParks.includes(park.parkCode);

    return (
      <div style={{
        ...style,
        left: style.left + GAP / 2,
        top: style.top + GAP / 2,
        width: style.width - GAP,
        height: style.height - GAP,
      }}>
        <ParkCard park={park} onSave={onSave} isSaved={isSaved} />
      </div>
    );
  };

  if (!parks || parks.length === 0) {
    return (
      <div className="text-center py-12">
        <p style={{ color: 'var(--text-secondary)' }}>No parks found</p>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <AutoSizer>
        {({ height, width }) => {
          const columnCount = Math.max(1, Math.floor(width / (COLUMN_WIDTH + GAP)));
          const rowCount = Math.ceil(parks.length / columnCount);

          return (
            <Grid
              columnCount={columnCount}
              columnWidth={COLUMN_WIDTH + GAP}
              height={height}
              rowCount={rowCount}
              rowHeight={ROW_HEIGHT + GAP}
              width={width}
              itemData={{ parks, columnCount }}
            >
              {Cell}
            </Grid>
          );
        }}
      </AutoSizer>
    </div>
  );
};

export default VirtualizedParkList;
