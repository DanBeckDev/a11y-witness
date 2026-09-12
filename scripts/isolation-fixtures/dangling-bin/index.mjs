// The LIBRARY half is sound, and that is the point: a smoke test that imports the package passes, because
// the defect is in a file the import never touches.
export const hello = () => "dangling-bin fixture works when installed";
