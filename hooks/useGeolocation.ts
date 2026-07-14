'use client';

import {useState, useEffect, useCallback} from 'react';

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  error: string | null;
  isLoading: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    address: null,
    error: null,
    isLoading: false,
  });

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setState((prev) => ({...prev, error: 'Geolocation not supported'}));
      return;
    }

    setState((prev) => ({...prev, isLoading: true, error: null}));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const {latitude, longitude} = position.coords;

        // Reverse geocode with LocationIQ if key is available
        let address = null;
        const locationIQKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;

        if (locationIQKey) {
          try {
            const res = await fetch(
              `https://us1.locationiq.com/v1/reverse?key=${locationIQKey}&lat=${latitude}&lon=${longitude}&format=json`
            );
            const data = await res.json();
            address = data.display_name;
          } catch {
            // Ignore geocoding errors
          }
        }

        setState({
          latitude,
          longitude,
          address,
          isLoading: false,
          error: null,
        });
      },
      (error) => {
        setState((prev) => ({
          ...prev,
          error: error.message,
          isLoading: false,
        }));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      }
    );
  }, []);

  return {
    ...state,
    requestLocation,
  };
}
