export interface Warehouse { warehouseId: number; warehouseName: string }
export interface Region { regionId: number; regionName: string; defaultWarehouseId: number }
export interface CustomerSegment { segmentId: number; segmentName: string; description: string }
export interface ProductCategory { categoryId: number; categoryName: string; targetMarginBps: number }
export interface Product { productId: number; productName: string; categoryId: number; unitPrice: number; unitCost: number; launchDate: string; isActive: boolean }
export interface ReferenceData { warehouses: Warehouse[]; regions: Region[]; customerSegments: CustomerSegment[]; productCategories: ProductCategory[]; products: Product[] }
