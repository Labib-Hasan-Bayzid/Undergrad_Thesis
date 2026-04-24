export type WorkshopListItem = {
  id: string;          // sellerId (user id)
  name: string;        // seller name
  city: string | null;
  sellerLocation: string | null;
  role: string;        // service_seller | spare_parts_seller
};
