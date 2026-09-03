import type { NextApiRequest, NextApiResponse } from "next";

type CarrierService = {
  id: number;
  name: string;
  callback_url: string;
  service_discovery: boolean;
  active: boolean;
};

type CarrierServicesResponse = {
  carrier_services?: CarrierService[];
  carrier_service?: CarrierService;
  errors?: unknown;
};

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

const API_VERSION = "2026-07";
const CARRIER_SERVICE_NAME = "FedEx Priority Overnight";
const CALLBACK_URL = "https://shipping.thehyun.com/api/shopify-rates";

async function shopifyRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  if (!SHOPIFY_SHOP) {
    throw new Error("Missing SHOPIFY_SHOP environment variable");
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    throw new Error("Missing SHOPIFY_ADMIN_ACCESS_TOKEN environment variable");
  }

  const response = await fetch(
    `https://${SHOPIFY_SHOP}/admin/api/${API_VERSION}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        ...(options.headers || {})
      }
    }
  );

  const data = (await response.json()) as T;

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!SHOPIFY_SHOP) {
    return res.status(500).json({
      error: "Missing SHOPIFY_SHOP environment variable"
    });
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({
      error: "Missing SHOPIFY_ADMIN_ACCESS_TOKEN environment variable"
    });
  }

  try {
    /*
      1. Check existing carrier services first
      This prevents duplicate "THE HYUN Local Delivery" rates.
    */
    const existingResponse = await shopifyRequest<CarrierServicesResponse>(
      "/carrier_services.json",
      {
        method: "GET"
      }
    );

    if (!existingResponse.ok) {
      return res.status(existingResponse.status).json({
        error: "Failed to fetch existing carrier services",
        data: existingResponse.data
      });
    }

    const existingCarrier = existingResponse.data.carrier_services?.find(
      (service) => service.name === CARRIER_SERVICE_NAME
    );

    /*
      2. If carrier already exists, update it.
    */
    if (existingCarrier) {
      const updateResponse = await shopifyRequest<CarrierServicesResponse>(
        `/carrier_services/${existingCarrier.id}.json`,
        {
          method: "PUT",
          body: JSON.stringify({
            carrier_service: {
              id: existingCarrier.id,
              name: CARRIER_SERVICE_NAME,
              callback_url: CALLBACK_URL,
              service_discovery: true,
              active: true
            }
          })
        }
      );

      if (!updateResponse.ok) {
        return res.status(updateResponse.status).json({
          error: "Failed to update carrier service",
          data: updateResponse.data
        });
      }

      return res.status(200).json({
        success: true,
        action: "updated",
        message: "Carrier service updated successfully",
        carrier_service: updateResponse.data.carrier_service
      });
    }

    /*
      3. If carrier does not exist, create it.
    */
    const createResponse = await shopifyRequest<CarrierServicesResponse>(
      "/carrier_services.json",
      {
        method: "POST",
        body: JSON.stringify({
          carrier_service: {
            name: CARRIER_SERVICE_NAME,
            callback_url: CALLBACK_URL,
            service_discovery: true,
            active: true
          }
        })
      }
    );

    if (!createResponse.ok) {
      return res.status(createResponse.status).json({
        error: "Failed to create carrier service",
        data: createResponse.data
      });
    }

    return res.status(200).json({
      success: true,
      action: "created",
      message: "Carrier service created successfully",
      carrier_service: createResponse.data.carrier_service
    });
  } catch (error) {
    console.error("Register carrier service error:", error);

    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
