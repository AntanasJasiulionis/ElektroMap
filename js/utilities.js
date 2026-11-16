'use strict';

// Debounce
const debounce = function (callbackFn, delay = 1000) {
  let timeout;

  return function (...inputs) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      callbackFn(...inputs);
    }, delay);
  };
};

// Throttle
const throttle = function (callbackFn, delay = 1000, instant = true) {
  let shouldWait = false;
  let waitingInputs = null;

  const timeOutFunction = () => {
    if (waitingInputs === null) return (shouldWait = false);

    callbackFn(...waitingInputs);
    waitingInputs = null;
    setTimeout(timeOutFunction, delay);
  };

  return function (...inputs) {
    if (shouldWait) {
      waitingInputs = inputs;
      return;
    }

    instant
      ? callbackFn(...inputs)
      : setTimeout(callbackFn.bind(null, ...inputs), 100);
    shouldWait = true;

    setTimeout(timeOutFunction, delay);
  };
};

// Calculate distance between 2 coordinates
const getDistance = function (coord1, coord2) {
  const R = 2 * 6371000;
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;

  // Convert degrees to radius
  const degToRad = function (degree) {
    return (degree * Math.PI) / 180;
  };

  // convert meters to kilometers
  const toKm = function (meters) {
    // 1 option: 1.7 km
    // return Math.round((meters / 1000) * 10) / 10;

    // 2 option: 1km 700m
    return { km: Math.trunc(meters / 1000), m: Math.trunc(meters % 1000) };
  };

  const diffLat = degToRad(lat2 - lat1);
  const diffLong = degToRad(lon2 - lon1);

  const harvF =
    Math.sin(diffLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(diffLong / 2) ** 2;

  const distance = R * Math.atan2(Math.sqrt(harvF), Math.sqrt(1 - harvF));

  return toKm(distance);
};

// Convert LKS94 to WGS84 coordinates
const lks94ToWgs84 = function (E, N) {
  const a = 6378137;
  const e2 = 0.006694380023;
  const k = 0.9998;
  const lon0 = (24 * Math.PI) / 180;

  const radToDec = function (rad) {
    return ((rad * 180) / Math.PI).toFixed(6);
  };

  // Remove false easting
  const x = E - 500000;

  // Meridian distance
  const M = N / k;

  // Footpoint latitude
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));

  const p =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin = Math.sin(p);
  const cos = Math.cos(p);
  const tan = Math.tan(p);

  const ep2 = e2 / (1 - e2);
  const radius = a / Math.sqrt(1 - e2 * sin ** 2);
  const meridian = (a * (1 - e2)) / (1 - e2 * sin ** 2) ** 1.5;

  const T = tan ** 2;
  const C = ep2 * cos ** 2;
  const D = x / (radius * k);

  // Latitude
  const lat =
    p -
    ((radius * tan) / meridian) *
      (D ** 2 / 2 -
        ((5 + 3 * T + 10 * C - 4 * C ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T + 298 * C + 45 * T ** 2 - 252 * ep2 - 3 * C ** 2) *
          D ** 6) /
          720);

  // Longitude
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T + C) * D ** 3) / 6 +
      ((5 - 2 * C + 28 * T - 3 * C ** 2 + 8 * ep2 + 24 * T ** 2) * D ** 5) /
        120) /
      cos;

  const coords = [radToDec(lat), radToDec(lon)];
  return coords;
};
