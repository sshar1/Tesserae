import {
  NodeData,
  MeshType,
  TransformProperty,
  cloneNodeData,
} from './operations';

export interface SceneNode {
  id: number;
  name: string;
  meshType: MeshType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  parentId: number | null;
  children: SceneNode[];
}

export class SceneState {
  private root: SceneNode;
  private nodeMap = new Map<number, SceneNode>();
  private nextId = 1;

  constructor() {
    this.root = this.createRootNode();
    this.initDefaultScene();
  }

  private createRootNode(): SceneNode {
    const rootNode: SceneNode = {
      id: 1,
      name: 'Root',
      meshType: 'None',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      parentId: null,
      children: [],
    };
    return rootNode;
  }

  /**
   * Initializes default scene matching the C++ engine:
   * Root node (id: 1) containing a default Cube (id: 2).
   */
  public initDefaultScene(): void {
    this.nodeMap.clear();
    this.root = this.createRootNode();
    this.nodeMap.set(this.root.id, this.root);
    this.nextId = 2;

    const defaultCube: NodeData = {
      id: this.generateNextId(),
      name: 'Cube',
      meshType: 'Cube',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      children: [],
    };

    this.addNode(this.root.id, defaultCube);
  }

  public generateNextId(): number {
    return this.nextId++;
  }

  public ensureIdCapacity(id: number): void {
    if (id >= this.nextId) {
      this.nextId = id + 1;
    }
  }

  public findNode(id: number): SceneNode | null {
    return this.nodeMap.get(id) || null;
  }

  public findParent(id: number): SceneNode | null {
    const node = this.findNode(id);
    if (!node || node.parentId === null) return null;
    return this.findNode(node.parentId);
  }

  /**
   * Checks if ancestorId is an ancestor of descendantId.
   */
  public isAncestor(ancestorId: number, descendantId: number): boolean {
    if (ancestorId === descendantId) return true;
    let curr = this.findNode(descendantId);
    while (curr && curr.parentId !== null) {
      if (curr.parentId === ancestorId) {
        return true;
      }
      curr = this.findNode(curr.parentId);
    }
    return false;
  }

  /**
   * Adds a node into the scene hierarchy under parentId.
   */
  public addNode(
    parentId: number,
    nodeData: NodeData,
    insertIndex?: number
  ): { success: boolean; node?: SceneNode; error?: string } {
    // If parent is 0 or matches root id, attach to root
    const targetParent = parentId === 0 || parentId === this.root.id ? this.root : this.findNode(parentId);

    if (!targetParent) {
      return { success: false, error: `Parent node ${parentId} not found` };
    }

    if (this.nodeMap.has(nodeData.id)) {
      return { success: false, error: `Node with id ${nodeData.id} already exists` };
    }

    this.ensureIdCapacity(nodeData.id);

    const newNode: SceneNode = {
      id: nodeData.id,
      name: nodeData.name,
      meshType: nodeData.meshType,
      position: [nodeData.position[0], nodeData.position[1], nodeData.position[2]],
      rotation: [nodeData.rotation[0], nodeData.rotation[1], nodeData.rotation[2]],
      scale: [nodeData.scale[0], nodeData.scale[1], nodeData.scale[2]],
      parentId: targetParent.id,
      children: [],
    };

    this.nodeMap.set(newNode.id, newNode);

    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= targetParent.children.length) {
      targetParent.children.splice(insertIndex, 0, newNode);
    } else {
      targetParent.children.push(newNode);
    }

    // Recursively add any nested children present in nodeData
    if (nodeData.children && Array.isArray(nodeData.children)) {
      for (const childData of nodeData.children) {
        this.addNode(newNode.id, childData);
      }
    }

    return { success: true, node: newNode };
  }

  /**
   * Deletes a node and its entire subtree from the scene graph.
   * Returns a complete snapshot of the deleted subtree and its parent info.
   */
  public deleteNode(nodeId: number): {
    success: boolean;
    deletedNode?: NodeData;
    parentId?: number;
    index?: number;
    error?: string;
  } {
    if (nodeId === this.root.id) {
      return { success: false, error: 'Cannot delete root node' };
    }

    const node = this.findNode(nodeId);
    if (!node || node.parentId === null) {
      return { success: false, error: `Node ${nodeId} not found` };
    }

    const parent = this.findNode(node.parentId);
    if (!parent) {
      return { success: false, error: `Parent for node ${nodeId} not found` };
    }

    const index = parent.children.findIndex((c) => c.id === nodeId);
    if (index === -1) {
      return { success: false, error: `Node ${nodeId} not found in parent children` };
    }

    // Capture snapshot of subtree before deleting
    const deletedNodeSnapshot = this.serializeNodeData(node);
    const parentId = parent.id;

    // Remove from parent children list
    parent.children.splice(index, 1);

    // Recursively remove from nodeMap
    this.removeSubtreeFromMap(node);

    return {
      success: true,
      deletedNode: deletedNodeSnapshot,
      parentId,
      index,
    };
  }

  private removeSubtreeFromMap(node: SceneNode): void {
    this.nodeMap.delete(node.id);
    for (const child of node.children) {
      this.removeSubtreeFromMap(child);
    }
  }

  /**
   * Updates a transform property (position, rotation, scale) for a node.
   */
  public updateTransform(
    nodeId: number,
    property: TransformProperty,
    value: [number, number, number]
  ): { success: boolean; previousValue?: [number, number, number]; error?: string } {
    const node = this.findNode(nodeId);
    if (!node) {
      return { success: false, error: `Node ${nodeId} not found` };
    }

    const previousValue: [number, number, number] = [
      node[property][0],
      node[property][1],
      node[property][2],
    ];

    node[property] = [value[0], value[1], value[2]];

    return {
      success: true,
      previousValue,
    };
  }

  /**
   * Reparents a node to a new parent, checking for cycle prevention.
   */
  public reparentNode(
    nodeId: number,
    newParentId: number,
    insertIndex?: number
  ): { success: boolean; error?: string } {
    if (nodeId === this.root.id) {
      return { success: false, error: 'Cannot reparent root node' };
    }

    const node = this.findNode(nodeId);
    if (!node || node.parentId === null) {
      return { success: false, error: `Node ${nodeId} not found` };
    }

    const currentParent = this.findNode(node.parentId);
    if (!currentParent) {
      return { success: false, error: `Current parent of node ${nodeId} not found` };
    }

    const targetParent = newParentId === 0 || newParentId === this.root.id ? this.root : this.findNode(newParentId);
    if (!targetParent) {
      return { success: false, error: `Target parent ${newParentId} not found` };
    }

    // Prevent cycle: new parent cannot be the node itself or a descendant
    if (this.isAncestor(node.id, targetParent.id)) {
      return { success: false, error: 'Cannot reparent node to its own descendant (cycle detected)' };
    }

    // Remove from old parent
    const oldIndex = currentParent.children.findIndex((c) => c.id === nodeId);
    if (oldIndex !== -1) {
      currentParent.children.splice(oldIndex, 1);
    }

    // Attach to new parent
    node.parentId = targetParent.id;
    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= targetParent.children.length) {
      targetParent.children.splice(insertIndex, 0, node);
    } else {
      targetParent.children.push(node);
    }

    return { success: true };
  }

  /**
   * Serializes a single SceneNode and its children to plain NodeData.
   */
  public serializeNodeData(node: SceneNode): NodeData {
    return {
      id: node.id,
      name: node.name,
      meshType: node.meshType,
      position: [node.position[0], node.position[1], node.position[2]],
      rotation: [node.rotation[0], node.rotation[1], node.rotation[2]],
      scale: [node.scale[0], node.scale[1], node.scale[2]],
      children: node.children.map((child) => this.serializeNodeData(child)),
    };
  }

  /**
   * Gets the entire scene hierarchy as an array of top-level NodeData
   * (the children of the root node, matching C++ get_scene_hierarchy).
   */
  public getHierarchy(): NodeData[] {
    return this.root.children.map((child) => this.serializeNodeData(child));
  }

  /**
   * Gets the complete scene hierarchy including root.
   */
  public getFullSnapshot(): NodeData {
    return this.serializeNodeData(this.root);
  }

  /**
   * Replaces current scene state with a given snapshot.
   */
  public loadSnapshot(hierarchy: NodeData[]): void {
    this.nodeMap.clear();
    this.root = this.createRootNode();
    this.nodeMap.set(this.root.id, this.root);
    this.nextId = 2;

    for (const nodeData of hierarchy) {
      this.addNode(this.root.id, nodeData);
    }
  }

  public getNodeCount(): number {
    return this.nodeMap.size;
  }
}
