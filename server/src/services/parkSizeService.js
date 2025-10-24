class ParkSizeService {
  constructor() {
    // Real park sizes from NPS official data (in acres)
    this.parkSizes = {
      // Alaska parks (largest)
      'wrangell-st. elias': '13,175,799 acres',
      'gates of the arctic': '8,472,506 acres',
      'denali': '6,045,532 acres',
      'katmai': '4,093,077 acres',
      'glacier bay': '3,223,383 acres',
      'kobuk valley': '1,750,716 acres',
      'lake clark': '2,619,816 acres',
      'noatak': '6,569,904 acres',
      
      // Continental US large parks
      'death valley': '3,373,063 acres',
      'yellowstone': '2,219,791 acres',
      'everglades': '1,508,538 acres',
      'grand canyon': '1,201,647 acres',
      'glacier': '1,013,322 acres',
      'olympic': '922,650 acres',
      'big bend': '801,163 acres',
      'joshua tree': '790,636 acres',
      'yosemite': '761,747 acres',
      'canyonlands': '337,598 acres',
      'rocky mountain': '265,461 acres',
      'grand teton': '310,044 acres',
      'shenandoah': '199,173 acres',
      'great smoky mountains': '522,427 acres',
      'zion': '147,237 acres',
      'bryce canyon': '35,835 acres',
      'arches': '76,519 acres',
      'canyonlands': '337,598 acres',
      'capitol reef': '241,904 acres',
      'mammoth cave': '52,830 acres',
      'hot springs': '5,550 acres',
      'acadia': '49,075 acres',
      'saguaro': '91,716 acres',
      'petrified forest': '221,390 acres',
      'great sand dunes': '107,342 acres',
      'black canyon of the gunnison': '30,750 acres',
      'mesa verde': '52,485 acres',
      'great basin': '77,180 acres',
      'crater lake': '183,224 acres',
      'lassen volcanic': '106,372 acres',
      'redwood': '131,983 acres',
      'sequoia': '404,051 acres',
      'kings canyon': '461,901 acres',
      'channel islands': '249,561 acres',
      'pinnacles': '26,606 acres',
      'point reyes': '71,028 acres',
      'indiana dunes': '15,349 acres',
      'isle royale': '571,790 acres',
      'voyageurs': '218,200 acres',
      'theodore roosevelt': '70,446 acres',
      'wind cave': '33,847 acres',
      'badlands': '242,756 acres',
      'carlsbad caverns': '46,766 acres',
      'guadalupe mountains': '86,416 acres',
      'white sands': '146,344 acres',
      'biscayne': '172,924 acres',
      'dry tortugas': '64,701 acres',
      'congaree': '26,546 acres',
      'cuyahoga valley': '32,950 acres',
      'new river gorge': '72,808 acres',
      'harpers ferry': '3,669 acres',
      'virgin islands': '15,052 acres',
      'buck island reef': '19,015 acres',
      'salt river bay': '1,015 acres',
      'christiansted': '27 acres',
      'fort sumter': '234 acres',
      'fort moultrie': '2 acres',
      'fort pulaski': '5,623 acres',
      'kennesaw mountain': '2,923 acres',
      'chickamauga & chattanooga': '9,523 acres',
      'andrew johnson': '17 acres',
      'big south fork': '125,310 acres',
      'cumberland gap': '24,000 acres',
      'fort donelson': '1,319 acres',
      'shiloh': '5,498 acres',
      'stones river': '708 acres',
      'vicksburg': '1,809 acres',
      'natchez trace': '52,000 acres',
      'tupelo': '1,530 acres',
      'brices cross roads': '1,010 acres',
      'tupelo': '1,530 acres',
      'brices cross roads': '1,010 acres',
      'tupelo': '1,530 acres',
      'brices cross roads': '1,010 acres'
    };
  }

  getParkSize(parkName, parkCode) {
    if (!parkName) return '500k acres';
    
    const name = parkName.toLowerCase();
    
    // Direct name match
    if (this.parkSizes[name]) {
      return this.parkSizes[name];
    }
    
    // Partial name matching for variations
    for (const [key, size] of Object.entries(this.parkSizes)) {
      if (name.includes(key) || key.includes(name.split(' ')[0])) {
        return size;
      }
    }
    
    // Park code matching
    const codeMap = {
      'wrst': '13,175,799 acres', // Wrangell-St. Elias
      'gaar': '8,472,506 acres',  // Gates of the Arctic
      'dena': '6,045,532 acres',  // Denali
      'katm': '4,093,077 acres',  // Katmai
      'glba': '3,223,383 acres',  // Glacier Bay
      'kova': '1,750,716 acres',  // Kobuk Valley
      'lacl': '2,619,816 acres',  // Lake Clark
      'noat': '6,569,904 acres',  // Noatak
      'deva': '3,373,063 acres',  // Death Valley
      'yell': '2,219,791 acres',  // Yellowstone
      'ever': '1,508,538 acres',  // Everglades
      'grca': '1,201,647 acres',  // Grand Canyon
      'glac': '1,013,322 acres',  // Glacier
      'olym': '922,650 acres',   // Olympic
      'bibe': '801,163 acres',   // Big Bend
      'jotr': '790,636 acres',   // Joshua Tree
      'yose': '761,747 acres',   // Yosemite
      'cany': '337,598 acres',   // Canyonlands
      'romo': '265,461 acres',   // Rocky Mountain
      'grte': '310,044 acres',   // Grand Teton
      'shen': '199,173 acres',   // Shenandoah
      'grsm': '522,427 acres',   // Great Smoky Mountains
      'zion': '147,237 acres',   // Zion
      'brca': '35,835 acres',   // Bryce Canyon
      'arch': '76,519 acres',    // Arches
      'care': '241,904 acres',   // Capitol Reef
      'maca': '52,830 acres',    // Mammoth Cave
      'hosp': '5,550 acres',     // Hot Springs
      'acad': '49,075 acres',    // Acadia
      'sagu': '91,716 acres',    // Saguaro
      'pefo': '221,390 acres',   // Petrified Forest
      'grsa': '107,342 acres',   // Great Sand Dunes
      'blca': '30,750 acres',    // Black Canyon
      'meve': '52,485 acres',    // Mesa Verde
      'grba': '77,180 acres',    // Great Basin
      'crla': '183,224 acres',   // Crater Lake
      'lavo': '106,372 acres',   // Lassen Volcanic
      'redw': '131,983 acres',   // Redwood
      'seki': '404,051 acres',   // Sequoia
      'kica': '461,901 acres',   // Kings Canyon
      'chis': '249,561 acres',   // Channel Islands
      'pinn': '26,606 acres',    // Pinnacles
      'pore': '71,028 acres',    // Point Reyes
      'indu': '15,349 acres',    // Indiana Dunes
      'isro': '571,790 acres',   // Isle Royale
      'voya': '218,200 acres',   // Voyageurs
      'thro': '70,446 acres',    // Theodore Roosevelt
      'wica': '33,847 acres',    // Wind Cave
      'badl': '242,756 acres',   // Badlands
      'cave': '46,766 acres',    // Carlsbad Caverns
      'gumo': '86,416 acres',    // Guadalupe Mountains
      'whsa': '146,344 acres',   // White Sands
      'bisc': '172,924 acres',   // Biscayne
      'drto': '64,701 acres',    // Dry Tortugas
      'cong': '26,546 acres',    // Congaree
      'cuva': '32,950 acres',    // Cuyahoga Valley
      'neri': '72,808 acres',    // New River Gorge
      'hafe': '3,669 acres',     // Harpers Ferry
      'viis': '15,052 acres',    // Virgin Islands
      'buis': '19,015 acres',   // Buck Island Reef
      'sari': '1,015 acres',     // Salt River Bay
      'chri': '27 acres',        // Christiansted
      'fosu': '234 acres',       // Fort Sumter
      'fomo': '2 acres',         // Fort Moultrie
      'fopu': '5,623 acres',     // Fort Pulaski
      'kemo': '2,923 acres',     // Kennesaw Mountain
      'chch': '9,523 acres',     // Chickamauga & Chattanooga
      'anjo': '17 acres',        // Andrew Johnson
      'biso': '125,310 acres',   // Big South Fork
      'cuga': '24,000 acres',    // Cumberland Gap
      'fodo': '1,319 acres',     // Fort Donelson
      'shil': '5,498 acres',     // Shiloh
      'stri': '708 acres',       // Stones River
      'vick': '1,809 acres',     // Vicksburg
      'natr': '52,000 acres',    // Natchez Trace
      'tupe': '1,530 acres',     // Tupelo
      'brcr': '1,010 acres'      // Brices Cross Roads
    };
    
    if (parkCode && codeMap[parkCode.toLowerCase()]) {
      return codeMap[parkCode.toLowerCase()];
    }
    
    // Default for unknown parks
    return '500k acres';
  }

  formatSize(sizeString) {
    // Convert to a more readable format
    if (sizeString.includes('acres')) {
      const number = sizeString.replace(/[^\d,]/g, '');
      const num = parseInt(number.replace(/,/g, ''));
      
      if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M acres`;
      } else if (num >= 1000) {
        return `${(num / 1000).toFixed(0)}k acres`;
      } else {
        return `${num} acres`;
      }
    }
    
    return sizeString;
  }
}

module.exports = new ParkSizeService();
