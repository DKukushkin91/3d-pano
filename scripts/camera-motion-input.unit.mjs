import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  DEFAULT_CONTROLS_OPTIONS,
  isHandledKeyDown,
  isHandledPointerDown,
  isHandledWheel,
} from '../dist/internal.js';

const controlsWith = (fields = {}) => ({ ...DEFAULT_CONTROLS_OPTIONS, ...fields });

const pointerDown = (fields = {}) => ({ isOnPanorama: true, pointerType: 'mouse', button: 0, ...fields });

const keyDown = (fields = {}) => ({ key: 'ArrowLeft', isOnRoot: true, hasModifier: false, ...fields });

describe('camera-motion · Прерывание вводом пользователя', () => {
  it('Пользователь хватает панораму: нажатие на панораму, касание и второй палец обрабатываются', () => {
    assert.ok(isHandledPointerDown(pointerDown(), controlsWith()));
    assert.ok(isHandledPointerDown(pointerDown({ pointerType: 'touch' }), controlsWith()));
    assert.ok(isHandledPointerDown(pointerDown({ pointerType: 'touch' }), controlsWith({ drag: false })));
  });

  it('Кнопка хоста в оверлее и правая кнопка мыши поворот не прерывают', () => {
    assert.ok(!isHandledPointerDown(pointerDown({ isOnPanorama: false }), controlsWith()));
    assert.ok(!isHandledPointerDown(pointerDown({ button: 2 }), controlsWith()));
  });

  it('отключённые перетаскивание и щипок, колесо и клавиатура поворот не прерывают', () => {
    assert.ok(!isHandledPointerDown(pointerDown(), controlsWith({ drag: false, pinch: false })));
    assert.ok(!isHandledWheel(true, controlsWith({ wheel: false })));
    assert.ok(!isHandledKeyDown(keyDown(), controlsWith({ keyboard: false })));
  });

  it('колесо прерывает поворот только над панорамой', () => {
    assert.ok(isHandledWheel(true, controlsWith()));
    assert.ok(!isHandledWheel(false, controlsWith()));
  });

  it('клавиша управления в фокусе корня прерывает поворот, сочетания и чужие клавиши — нет', () => {
    assert.ok(isHandledKeyDown(keyDown(), controlsWith()));
    assert.ok(isHandledKeyDown(keyDown({ key: '+' }), controlsWith()));
    assert.ok(!isHandledKeyDown(keyDown({ hasModifier: true }), controlsWith()));
    assert.ok(!isHandledKeyDown(keyDown({ isOnRoot: false }), controlsWith()));
    assert.ok(!isHandledKeyDown(keyDown({ key: 'Enter' }), controlsWith()));
  });
});

describe('camera-motion · Плавный поворот к цели (публичный тип)', () => {
  it('ядро экспортирует ILookAtOptions и TViewTarget, а у просмотрщика есть lookAt', async () => {
    const declarations = await readFile(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
    const chunks = await Promise.all(
      [...declarations.matchAll(/from "\.\/([^"]+)\.js"/g)].map(([, chunk]) =>
        readFile(new URL(`../dist/${chunk}.d.ts`, import.meta.url), 'utf8'),
      ),
    );

    assert.match(declarations, /\bILookAtOptions\b/);
    assert.match(declarations, /\bTViewTarget\b/);
    assert.ok(
      chunks.some((source) => /lookAt: \(target: TViewTarget, options\?: ILookAtOptions\)/.test(source)),
    );
  });
});
