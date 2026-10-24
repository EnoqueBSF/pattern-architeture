import type { NodeType } from '../schema/enums.js';
import { hexagonShape, octagonShape, parallelogramShape, pillShape, rectShape, roundedRectShape, stackedShape } from './basic.js';
import { iconCardShape } from './card.js';
import { bucketShape, cylinderShape, diskStackShape, pipeShape } from './storage.js';
import { browserShape, cloudShape, deviceShape, personShape } from './special.js';
import type { Shape } from './types.js';

export const SHAPE_BY_TYPE: Record<NodeType, Shape> = {
  microservice: roundedRectShape,
  'api-gateway': octagonShape,
  'frontend-web': browserShape,
  'mobile-app': deviceShape,
  database: cylinderShape,
  cache: diskStackShape,
  'message-broker': hexagonShape,
  queue: pipeShape,
  worker: stackedShape,
  storage: bucketShape,
  cdn: parallelogramShape,
  'load-balancer': pillShape,
  'external-service': cloudShape,
  actor: personShape,
  generic: rectShape,
};

export function getShape(type: NodeType): Shape {
  return SHAPE_BY_TYPE[type];
}

/** Forma efetiva de um node: card-com-icone quando ele tem um icone resolvido, senao a forma do type. */
export function shapeForNode(n: { type: NodeType; icon?: string }): Shape {
  return n.icon ? iconCardShape : getShape(n.type);
}
