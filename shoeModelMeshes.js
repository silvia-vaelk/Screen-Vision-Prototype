// Shared global ref so all raycasters (RedlineCanvasOverlay, CommentsModeCursor, RaycastPlane)
// always see the same live mesh list without prop-drilling.
const shoeModelMeshes = { current: [] };
export default shoeModelMeshes;
