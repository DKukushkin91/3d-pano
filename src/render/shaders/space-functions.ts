/**
 * Сдвиг камеры внутри сцены (`sceneDirection`, та же формула, что в `math/scene-space.ts`): луч из камеры,
 * сдвинутой на `cameraOffset` от центра, пересекается с полом на `floorDepth` ниже центра (`0` — пола нет)
 * и со сферой `modelRadius`, а выборка берётся по направлению из центра на точку пересечения. Без сдвига
 * функция возвращает сам луч — условие одно на весь кадр, поэтому производные пикселя не страдают.
 */
export const SPACE_FUNCTIONS = `
uniform vec3 cameraOffset;
uniform float floorDepth;
uniform float modelRadius;

vec3 sceneDirection(vec3 ray) {
  if (cameraOffset == vec3(0.0)) {
    return ray;
  }

  float along = dot(cameraOffset, ray);
  float reach = sqrt(max(0.0, along * along - dot(cameraOffset, cameraOffset) + modelRadius * modelRadius));
  float hitDistance = reach - along;

  if (floorDepth > 0.0 && ray.y < 0.0) {
    float floorDistance = (-floorDepth - cameraOffset.y) / ray.y;

    if (floorDistance > 0.0 && floorDistance < hitDistance) {
      hitDistance = floorDistance;
    }
  }

  return normalize(cameraOffset + ray * hitDistance);
}
`;
