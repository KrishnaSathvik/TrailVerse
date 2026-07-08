import { useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

type MapViewRef = ComponentRef<typeof MapView>;

export type MapParkPin = {
  parkCode: string;
  fullName: string;
  states?: string;
  latitude?: string | number;
  longitude?: string | number;
};

const US_CENTER: Region = {
  latitude: 39.8283,
  longitude: -98.5795,
  latitudeDelta: 45,
  longitudeDelta: 60,
};

function toCoord(park: MapParkPin) {
  const lat = Number(park.latitude);
  const lng = Number(park.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

type ParksMapViewProps = {
  parks: MapParkPin[];
  selectedParkCode?: string | null;
  onSelectPark: (park: MapParkPin) => void;
  mapRef?: RefObject<MapViewRef | null>;
};

export default function ParksMapView({
  parks,
  selectedParkCode,
  onSelectPark,
  mapRef: externalRef,
}: ParksMapViewProps) {
  const internalRef = useRef<MapViewRef>(null);
  const mapRef = externalRef ?? internalRef;

  const pins = useMemo(
    () =>
      parks
        .map((park) => {
          const coordinate = toCoord(park);
          if (!coordinate) return null;
          return { park, coordinate };
        })
        .filter(Boolean) as Array<{ park: MapParkPin; coordinate: { latitude: number; longitude: number } }>,
    [parks],
  );

  const focusPark = (park: MapParkPin) => {
    focusMapPark(mapRef, park);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={US_CENTER}
        showsUserLocation={false}
        showsCompass
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}>
        {pins.map(({ park, coordinate }) => (
          <Marker
            key={park.parkCode}
            title={park.fullName}
            description={park.states}
            coordinate={coordinate}
            pinColor={selectedParkCode === park.parkCode ? '#059669' : '#10b981'}
            onPress={() => {
              onSelectPark(park);
              focusPark(park);
            }}
          />
        ))}
      </MapView>
    </View>
  );
}

export function focusMapPark(mapRef: RefObject<MapViewRef | null>, park: MapParkPin) {
  const lat = Number(park.latitude);
  const lng = Number(park.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !mapRef.current) return;
  mapRef.current.animateToRegion(
    { latitude: lat, longitude: lng, latitudeDelta: 2.5, longitudeDelta: 2.5 },
    350,
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
});
