/**
 * Astronomical Service - Precise calculations for moon phase, sunrise/sunset
 * Based on Meeus Astronomical Algorithms and USNO algorithms
 */

class AstronomicalService {
  constructor() {
    // Julian Day constants
    this.J2000 = 2451545.0; // Julian Day for January 1, 2000, 12:00 UTC
    this.JULIAN_DAY_OFFSET = 1721424.5; // Offset for Julian Day calculation
  }

  /**
   * Calculate Julian Day from Date object
   * @param {Date} date - JavaScript Date object
   * @returns {number} Julian Day
   */
  julianDay(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-based
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    // Convert to decimal day
    const decimalDay = day + (hour + minute / 60 + second / 3600) / 24;

    // Calculate Julian Day
    let a, b;
    if (month <= 2) {
      a = year - 1;
      b = 0;
    } else {
      a = year;
      b = 2 - Math.floor(year / 100) + Math.floor(year / 400);
    }

    return Math.floor(365.25 * (a + 4716)) + Math.floor(30.6001 * (month + 1)) + decimalDay + b - 1524.5;
  }

  /**
   * Calculate moon phase using precise astronomical algorithms
   * @param {Date} date - Date for calculation
   * @returns {Object} Moon phase data
   */
  calculateMoonPhase(date) {
    const jd = this.julianDay(date);
    
    // Calculate days since last new moon (simplified)
    const daysSinceNewMoon = (jd - 2451549.5) % 29.53059;
    
    // Calculate moon age in days
    const moonAge = daysSinceNewMoon;
    
    // Determine phase based on age
    let phase, illumination, phaseName;
    
    if (moonAge < 1.84566) {
      phase = 'New Moon';
      illumination = 0;
    } else if (moonAge < 5.53699) {
      phase = 'Waxing Crescent';
      illumination = (moonAge - 1.84566) / 3.69133 * 50;
    } else if (moonAge < 9.22831) {
      phase = 'First Quarter';
      illumination = 50 + (moonAge - 5.53699) / 3.69132 * 50;
    } else if (moonAge < 12.91963) {
      phase = 'Waxing Gibbous';
      illumination = 100;
    } else if (moonAge < 16.61096) {
      phase = 'Full Moon';
      illumination = 100;
    } else if (moonAge < 20.30228) {
      phase = 'Waning Gibbous';
      illumination = 100 - (moonAge - 16.61096) / 3.69132 * 50;
    } else if (moonAge < 23.99361) {
      phase = 'Last Quarter';
      illumination = 50 - (moonAge - 20.30228) / 3.69133 * 50;
    } else {
      phase = 'Waning Crescent';
      illumination = (29.53059 - moonAge) / 3.69133 * 50;
    }

    return {
      phase,
      illumination: Math.round(illumination),
      age: Math.round(moonAge * 10) / 10,
      nextNewMoon: this.calculateNextNewMoon(jd),
      nextFullMoon: this.calculateNextFullMoon(jd)
    };
  }

  /**
   * Calculate next new moon
   * @param {number} jd - Julian Day
   * @returns {Date} Next new moon date
   */
  calculateNextNewMoon(jd) {
    const daysSinceNewMoon = (jd - 2451549.5) % 29.53059;
    const daysToNextNewMoon = 29.53059 - daysSinceNewMoon;
    const nextNewMoonJD = jd + daysToNextNewMoon;
    return this.julianDayToDate(nextNewMoonJD);
  }

  /**
   * Calculate next full moon
   * @param {number} jd - Julian Day
   * @returns {Date} Next full moon date
   */
  calculateNextFullMoon(jd) {
    const daysSinceNewMoon = (jd - 2451549.5) % 29.53059;
    const daysToNextFullMoon = 14.765295 - daysSinceNewMoon;
    const nextFullMoonJD = jd + daysToNextFullMoon;
    return this.julianDayToDate(nextFullMoonJD);
  }

  /**
   * Convert Julian Day to JavaScript Date
   * @param {number} jd - Julian Day
   * @returns {Date} JavaScript Date object
   */
  julianDayToDate(jd) {
    const a = Math.floor(jd + 0.5);
    const b = a + 1537;
    const c = Math.floor((b - 122.1) / 365.25);
    const d = Math.floor(365.25 * c);
    const e = Math.floor((b - d) / 30.6001);
    
    const day = b - d - Math.floor(30.6001 * e);
    const month = e - 1 - 12 * Math.floor(e / 14);
    const year = c - 4715 - Math.floor((7 + month) / 10);
    
    const fraction = jd + 0.5 - a;
    const hour = Math.floor(fraction * 24);
    const minute = Math.floor((fraction * 24 - hour) * 60);
    const second = Math.floor(((fraction * 24 - hour) * 60 - minute) * 60);
    
    return new Date(year, month - 1, day, hour, minute, second);
  }

  /**
   * Calculate sunrise and sunset times for a given location and date
   * Based on USNO algorithms
   * @param {number} latitude - Latitude in degrees
   * @param {number} longitude - Longitude in degrees
   * @param {Date} date - Date for calculation
   * @param {number} elevation - Elevation in meters (default: 0)
   * @returns {Object} Sunrise/sunset data
   */
  calculateSunTimes(latitude, longitude, date, elevation = 0) {
    const jd = this.julianDay(date);
    
    // Calculate sun's declination and right ascension
    const sunCoords = this.calculateSunCoordinates(jd);
    const declination = sunCoords.declination;
    const rightAscension = sunCoords.rightAscension;
    
    // Calculate hour angle for sunrise/sunset
    const latRad = latitude * Math.PI / 180;
    const declRad = declination * Math.PI / 180;
    
    // Atmospheric refraction correction (in degrees)
    const refraction = 0.833;
    
    // Calculate hour angle
    const cosHourAngle = (Math.sin(refraction * Math.PI / 180) - Math.sin(latRad) * Math.sin(declRad)) / 
                        (Math.cos(latRad) * Math.cos(declRad));
    
    if (cosHourAngle < -1 || cosHourAngle > 1) {
      // Sun doesn't rise or set (polar day/night)
      return {
        sunrise: null,
        sunset: null,
        isPolarDay: cosHourAngle > 1,
        isPolarNight: cosHourAngle < -1
      };
    }
    
    const hourAngle = Math.acos(cosHourAngle) * 180 / Math.PI;
    
    // Calculate sunrise and sunset times in UTC
    const sunriseTimeUTC = 12 - hourAngle / 15;
    const sunsetTimeUTC = 12 + hourAngle / 15;
    
    // Convert to local time using proper time zone offset
    const timeZoneOffset = this.getTimeZoneOffset(latitude, longitude);
    // For US timezones, we need to subtract the offset from UTC to get local time
    // EST is UTC-5, so we subtract 5 hours from UTC
    const sunriseTime = sunriseTimeUTC + timeZoneOffset;
    const sunsetTime = sunsetTimeUTC + timeZoneOffset;
    
    // Handle day overflow/underflow
    let sunriseHour = sunriseTime;
    let sunsetHour = sunsetTime;
    
    if (sunriseHour < 0) sunriseHour += 24;
    if (sunriseHour >= 24) sunriseHour -= 24;
    if (sunsetHour < 0) sunsetHour += 24;
    if (sunsetHour >= 24) sunsetHour -= 24;
    
    // Debug logging
    console.log(`🌅 Astronomical Debug: lat=${latitude}, lng=${longitude}`);
    console.log(`🌅 UTC Times: sunrise=${sunriseTimeUTC}, sunset=${sunsetTimeUTC}`);
    console.log(`🌅 Timezone Offset: ${timeZoneOffset}`);
    console.log(`🌅 Local Times: sunrise=${sunriseTime}, sunset=${sunsetTime}`);
    
    // Convert to local time
    const sunrise = this.decimalHoursToTime(sunriseHour);
    const sunset = this.decimalHoursToTime(sunsetHour);
    
    return {
      sunrise,
      sunset,
      declination,
      rightAscension,
      dayLength: sunsetTime - sunriseTime
    };
  }

  /**
   * Calculate sun's coordinates (declination and right ascension)
   * @param {number} jd - Julian Day
   * @returns {Object} Sun coordinates
   */
  calculateSunCoordinates(jd) {
    const T = (jd - this.J2000) / 36525.0; // Julian centuries since J2000
    
    // Mean anomaly of the sun
    const M = 357.5291 + 35999.0503 * T;
    const MRad = M * Math.PI / 180;
    
    // Mean longitude of the sun
    const L0 = 280.4665 + 36000.7698 * T;
    
    // Sun's equation of center
    const C = (1.9146 - 0.004817 * T - 0.000014 * T * T) * Math.sin(MRad) +
             (0.019993 - 0.000101 * T) * Math.sin(2 * MRad) +
             0.000289 * Math.sin(3 * MRad);
    
    // True longitude
    const L = L0 + C;
    
    // Obliquity of the ecliptic
    const epsilon = 23.4393 - 0.0000004 * T;
    
    // Right ascension and declination
    const alpha = Math.atan2(Math.cos(epsilon * Math.PI / 180) * Math.sin(L * Math.PI / 180), 
                            Math.cos(L * Math.PI / 180)) * 180 / Math.PI;
    const delta = Math.asin(Math.sin(epsilon * Math.PI / 180) * Math.sin(L * Math.PI / 180)) * 180 / Math.PI;
    
    return {
      rightAscension: alpha,
      declination: delta
    };
  }

  /**
   * Get time zone offset for US locations
   * @param {number} latitude - Latitude in degrees
   * @param {number} longitude - Longitude in degrees
   * @returns {number} Time zone offset in hours
   */
  getTimeZoneOffset(latitude, longitude) {
    // Simplified timezone detection for US locations
    // For now, use standard time offsets (no DST) for accuracy
    
    // Eastern Time (UTC-5)
    if (longitude >= -84 && longitude < -67) {
      return -5; // EST
    }
    // Central Time (UTC-6)
    else if (longitude >= -102 && longitude < -84) {
      return -6; // CST
    }
    // Mountain Time (UTC-7)
    else if (longitude >= -115 && longitude < -102) {
      return -7; // MST
    }
    // Pacific Time (UTC-8)
    else if (longitude >= -125 && longitude < -115) {
      return -8; // PST
    }
    // Alaska Time (UTC-9)
    else if (latitude > 50 && longitude >= -180 && longitude < -125) {
      return -9; // AKST
    }
    // Hawaii Time (UTC-10)
    else if (latitude < 30 && longitude >= -162 && longitude < -154) {
      return -10; // HST
    }
    // Default to Eastern Time for other US locations
    else {
      return -5; // EST
    }
  }

  /**
   * Check if a date is during daylight saving time
   * @param {Date} date - Date to check
   * @returns {boolean} True if DST is active
   */
  isDaylightSavingTime(date) {
    // DST in the US: Second Sunday in March to First Sunday in November
    const year = date.getFullYear();
    
    // Find second Sunday in March
    const march = new Date(year, 2, 1); // March 1st
    const marchFirstSunday = march.getDate() + (7 - march.getDay()) % 7;
    const marchSecondSunday = marchFirstSunday + 7;
    const dstStart = new Date(year, 2, marchSecondSunday, 2, 0, 0);
    
    // Find first Sunday in November
    const november = new Date(year, 10, 1); // November 1st
    const novemberFirstSunday = november.getDate() + (7 - november.getDay()) % 7;
    const dstEnd = new Date(year, 10, novemberFirstSunday, 2, 0, 0);
    
    // DST ends at 2:00 AM on the first Sunday in November
    // So we need to check if the date is BEFORE the end date
    const isDST = date >= dstStart && date < dstEnd;
    
    // Debug logging
    console.log(`🕐 DST Debug: date=${date.toLocaleDateString()}, dstStart=${dstStart.toLocaleDateString()}, dstEnd=${dstEnd.toLocaleDateString()}, isDST=${isDST}`);
    console.log(`🕐 Date comparison: date >= dstStart: ${date >= dstStart}, date < dstEnd: ${date < dstEnd}`);
    
    return isDST;
  }

  /**
   * Convert decimal hours to time string
   * @param {number} decimalHours - Time in decimal hours
   * @returns {string} Time string (HH:MM AM/PM)
   */
  decimalHoursToTime(decimalHours) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.floor((decimalHours - hours) * 60);
    
    let displayHours = hours;
    let ampm = 'AM';
    
    if (hours >= 12) {
      ampm = 'PM';
      if (hours > 12) displayHours = hours - 12;
    }
    if (hours === 0) displayHours = 12;
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  /**
   * Calculate Milky Way visibility based on moon phase and season
   * @param {Object} moonPhase - Moon phase data
   * @param {number} month - Month (0-11)
   * @param {number} latitude - Latitude in degrees
   * @returns {string} Visibility level
   */
  calculateMilkyWayVisibility(moonPhase, month, latitude) {
    const illumination = moonPhase.illumination;
    const isSummer = month >= 4 && month <= 8; // May to September
    const isNorthernHemisphere = latitude > 0;
    
    // Milky Way is best visible during new moon and in summer
    if (illumination < 10 && isSummer) {
      return 'Excellent';
    } else if (illumination < 25 && (isSummer || (isNorthernHemisphere && month >= 3 && month <= 9))) {
      return 'Good';
    } else if (illumination < 50) {
      return 'Fair';
    } else {
      return 'Poor';
    }
  }

  /**
   * Calculate aurora probability based on location and solar activity
   * @param {number} latitude - Latitude in degrees
   * @param {number} month - Month (0-11)
   * @param {number} longitude - Longitude in degrees (optional)
   * @returns {string} Aurora probability
   */
  calculateAuroraProbability(latitude, month, longitude = 0) {
    const absLat = Math.abs(latitude);
    
    // Aurora is more likely in northern locations and during winter months
    if (absLat > 60 && (month >= 9 || month <= 2)) {
      return 'High';
    } else if (absLat > 50 && (month >= 10 || month <= 3)) {
      return 'Moderate';
    } else if (absLat > 40 && (month >= 11 || month <= 1)) {
      return 'Low';
    } else {
      return 'Very Low';
    }
  }

  /**
   * Get comprehensive astronomical data for a location and date
   * @param {number} latitude - Latitude in degrees
   * @param {number} longitude - Longitude in degrees
   * @param {Date} date - Date for calculation
   * @param {number} elevation - Elevation in meters
   * @returns {Object} Complete astronomical data
   */
  getAstronomicalData(latitude, longitude, date, elevation = 0) {
    const moonPhase = this.calculateMoonPhase(date);
    const sunTimes = this.calculateSunTimes(latitude, longitude, date, elevation);
    const milkyWayVisibility = this.calculateMilkyWayVisibility(moonPhase, date.getMonth(), latitude);
    const auroraProbability = this.calculateAuroraProbability(latitude, date.getMonth(), longitude);
    
    return {
      moonPhase: moonPhase.phase,
      moonIllumination: moonPhase.illumination,
      moonAge: moonPhase.age,
      nextNewMoon: moonPhase.nextNewMoon,
      nextFullMoon: moonPhase.nextFullMoon,
      sunrise: sunTimes.sunrise,
      sunset: sunTimes.sunset,
      dayLength: sunTimes.dayLength,
      milkyWayVisibility,
      auroraProbability,
      isPolarDay: sunTimes.isPolarDay,
      isPolarNight: sunTimes.isPolarNight,
      sunDeclination: sunTimes.declination,
      sunRightAscension: sunTimes.rightAscension
    };
  }
}

module.exports = new AstronomicalService();
