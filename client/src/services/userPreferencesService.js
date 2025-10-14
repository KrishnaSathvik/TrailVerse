import api from './api';

class UserPreferencesService {
  // Get user preferences
  async getPreferences() {
    const response = await api.get('/users/preferences');
    return response.data;
  }

  // Update user preferences
  async updatePreferences(preferences) {
    const deviceInfo = this.getDeviceInfo();
    const response = await api.put('/users/preferences', {
      preferences,
      deviceInfo
    });
    return response.data;
  }

  // Update map state
  async updateMapState(mapState) {
    const deviceInfo = this.getDeviceInfo();
    const response = await api.put('/users/preferences/map-state', {
      mapState,
      deviceInfo
    });
    return response.data;
  }

  // Update navigation state
  async updateNavigation(navigation) {
    const deviceInfo = this.getDeviceInfo();
    const response = await api.put('/users/preferences/navigation', {
      navigation,
      deviceInfo
    });
    return response.data;
  }

  // Get active devices
  async getActiveDevices() {
    const response = await api.get('/users/preferences/devices');
    return response.data;
  }

  // Register device
  async registerDevice() {
    const deviceInfo = this.getDeviceInfo();
    const response = await api.post('/users/preferences/devices', {
      deviceInfo
    });
    return response.data;
  }

  // Sync preferences across devices
  async syncPreferences(lastSyncAt = null) {
    const deviceInfo = this.getDeviceInfo();
    const response = await api.post('/users/preferences/sync', {
      lastSyncAt,
      deviceInfo
    });
    return response.data;
  }

  // Get device information
  getDeviceInfo() {
    const userAgent = navigator.userAgent;
    let deviceType = 'desktop';
    
    if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
      deviceType = 'mobile';
    } else if (/iPad|Android.*Tablet|Windows.*Touch/i.test(userAgent)) {
      deviceType = 'tablet';
    }

    return {
      deviceId: this.getDeviceId(),
      deviceName: this.getDeviceName(),
      deviceType,
      userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language
    };
  }

  // Get or create device ID
  getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  // Get device name
  getDeviceName() {
    const userAgent = navigator.userAgent;
    let deviceName = 'Unknown Device';
    
    if (/iPhone/i.test(userAgent)) {
      deviceName = 'iPhone';
    } else if (/iPad/i.test(userAgent)) {
      deviceName = 'iPad';
    } else if (/Android/i.test(userAgent)) {
      deviceName = 'Android Device';
    } else if (/Windows/i.test(userAgent)) {
      deviceName = 'Windows PC';
    } else if (/Mac/i.test(userAgent)) {
      deviceName = 'Mac';
    } else if (/Linux/i.test(userAgent)) {
      deviceName = 'Linux PC';
    }
    
    return deviceName;
  }

  // Save to localStorage with sync flag
  saveToLocalStorage(key, data) {
    const dataWithSync = {
      ...data,
      _lastSync: Date.now(),
      _deviceId: this.getDeviceId()
    };
    localStorage.setItem(key, JSON.stringify(dataWithSync));
  }

  // Load from localStorage
  loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      return null;
    }
  }

  // Check if data needs sync
  needsSync(localData, serverData) {
    if (!localData || !serverData) return true;
    return new Date(localData._lastSync || 0) < new Date(serverData.lastSyncAt);
  }
}

export default new UserPreferencesService();
