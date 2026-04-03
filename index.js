import "dotenv/config";
import express from "express";
import * as ext from "./tools-extended.js";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const API_KEY = process.env.GHL_API_KEY;
const LOCATION_API_KEY = process.env.GHL_LOCATION_API_KEY;
const BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const PORT = process.env.PORT || 3000;
const MCP_SECRET = process.env.MCP_SECRET; // optional bearer token for security

if (!API_KEY) {
  console.error("Error: GHL_API_KEY environment variable is not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GHL API client helpers
// ---------------------------------------------------------------------------

async function ghlRequest(method, path, body, apiKey = API_KEY) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`GHL API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

const ghl = {
  get: (path) => ghlRequest("GET", path),
  post: (path, body) => ghlRequest("POST", path, body),
  put: (path, body) => ghlRequest("PUT", path, body),
  delete: (path, body) => ghlRequest("DELETE", path, body),
  locationGet: (path) =>
    ghlRequest("GET", path, undefined, LOCATION_API_KEY || API_KEY),
  locationPost: (path, body) =>
    ghlRequest("POST", path, body, LOCATION_API_KEY || API_KEY),
  locationPut: (path, body) =>
    ghlRequest("PUT", path, body, LOCATION_API_KEY || API_KEY),
  locationDelete: (path, body) =>
    ghlRequest("DELETE", path, body, LOCATION_API_KEY || API_KEY),
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools = [
  {
    name: "get_sub_accounts",
    description:
      "List all sub-accounts (locations) under the agency. Returns id, name, address, and other metadata for each location.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description:
            "Maximum number of results to return (default 10, max 100)",
        },
        skip: {
          type: "number",
          description: "Number of results to skip for pagination (default 0)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_contacts",
    description:
      "Get contacts for a specific sub-account (location). Returns a list of contacts with their details.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description: "The sub-account / location ID to fetch contacts from",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of contacts to return (default 20, max 100)",
        },
        query: {
          type: "string",
          description:
            "Search query to filter contacts by name, email, or phone",
        },
      },
      required: ["locationId"],
    },
  },
  {
    name: "create_contact",
    description: "Create a new contact inside a sub-account (location).",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description:
            "The sub-account / location ID where the contact will be created",
        },
        firstName: { type: "string", description: "Contact's first name" },
        lastName: { type: "string", description: "Contact's last name" },
        email: { type: "string", description: "Contact's email address" },
        phone: { type: "string", description: "Contact's phone number" },
        address1: { type: "string", description: "Street address" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State / province" },
        country: { type: "string", description: "Country code (e.g. US)" },
        postalCode: { type: "string", description: "ZIP / postal code" },
        website: { type: "string", description: "Website URL" },
        companyName: {
          type: "string",
          description: "Company the contact belongs to",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to apply to the contact",
        },
        source: {
          type: "string",
          description: "Lead source (e.g. 'API', 'Website', 'Referral')",
        },
      },
      required: ["locationId"],
    },
  },
  {
    name: "get_conversations",
    description:
      "Get a list of conversations for a location. Returns conversation IDs, contact info, last message, and unread counts.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description:
            "The sub-account / location ID to fetch conversations for",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of conversations to return (default 20, max 100)",
        },
        query: {
          type: "string",
          description: "Search query to filter conversations",
        },
      },
      required: ["locationId"],
    },
  },
  {
    name: "send_message",
    description:
      "Send an SMS or Email message to a contact in an existing conversation.",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "The conversation ID to send the message in",
        },
        type: {
          type: "string",
          enum: ["SMS", "Email"],
          description: "The type of message to send: SMS or Email",
        },
        message: {
          type: "string",
          description: "The message body / content to send",
        },
      },
      required: ["conversationId", "type", "message"],
    },
  },
  {
    name: "create_api_key",
    description:
      "Create an API key for a specific sub-account (location). Returns the newly created key details.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description:
            "The sub-account / location ID to create the API key for",
        },
        name: {
          type: "string",
          description: "A label / name for this API key",
        },
      },
      required: ["locationId", "name"],
    },
  },
  {
    name: "get_billing_charges",
    description:
      "Get agency wallet charges/transactions from the GHL billing system. Returns raw charge records which may include locationId, amount, type, and date.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description:
            "Start date for filtering charges (ISO 8601, e.g. 2026-01-01)",
        },
        endDate: {
          type: "string",
          description:
            "End date for filtering charges (ISO 8601, e.g. 2026-12-31)",
        },
        locationId: {
          type: "string",
          description:
            "Optional: filter charges for a specific sub-account location ID",
        },
        limit: {
          type: "number",
          description: "Number of results to return (default 100, max 100)",
        },
        skip: {
          type: "number",
          description: "Number of results to skip for pagination (default 0)",
        },
      },
      required: [],
    },
  },

  // ---- CONTACTS (extended) ----
  { name: "get_contact_tasks", description: "Get all tasks for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string", description: "Contact ID" } }, required: ["contactId"] } },
  { name: "create_contact_task", description: "Create a task for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, title: { type: "string" }, body: { type: "string" }, dueDate: { type: "string" }, completed: { type: "boolean" }, assignedTo: { type: "string" } }, required: ["contactId", "title", "dueDate"] } },
  { name: "get_contact_task", description: "Get a specific task for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, taskId: { type: "string" } }, required: ["contactId", "taskId"] } },
  { name: "update_contact_task", description: "Update a task for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, taskId: { type: "string" }, title: { type: "string" }, body: { type: "string" }, dueDate: { type: "string" }, completed: { type: "boolean" }, assignedTo: { type: "string" } }, required: ["contactId", "taskId"] } },
  { name: "delete_contact_task", description: "Delete a task from a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, taskId: { type: "string" } }, required: ["contactId", "taskId"] } },
  { name: "update_task_completion", description: "Mark a contact task as complete or incomplete.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, taskId: { type: "string" }, completed: { type: "boolean" } }, required: ["contactId", "taskId", "completed"] } },
  { name: "get_contact_note", description: "Get a specific note for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, noteId: { type: "string" } }, required: ["contactId", "noteId"] } },
  { name: "update_contact_note", description: "Update a note on a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, noteId: { type: "string" }, body: { type: "string" }, userId: { type: "string" } }, required: ["contactId", "noteId", "body"] } },
  { name: "delete_contact_note", description: "Delete a note from a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, noteId: { type: "string" } }, required: ["contactId", "noteId"] } },
  { name: "upsert_contact", description: "Create or update a contact (upsert).", inputSchema: { type: "object", properties: { locationId: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, address1: { type: "string" }, city: { type: "string" }, state: { type: "string" }, country: { type: "string" }, postalCode: { type: "string" }, website: { type: "string" }, timezone: { type: "string" }, companyName: { type: "string" }, tags: { type: "array", items: { type: "string" } }, customFields: { type: "array" } }, required: ["locationId"] } },
  { name: "get_duplicate_contact", description: "Find a duplicate contact by email or phone.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, email: { type: "string" }, phone: { type: "string" } }, required: ["locationId"] } },
  { name: "get_contacts_by_business", description: "Get contacts associated with a business.", inputSchema: { type: "object", properties: { businessId: { type: "string" }, limit: { type: "number" }, skip: { type: "number" }, query: { type: "string" } }, required: ["businessId"] } },
  { name: "get_contact_appointments", description: "Get all appointments for a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "bulk_update_contact_tags", description: "Bulk add or remove tags from multiple contacts.", inputSchema: { type: "object", properties: { contactIds: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } }, operation: { type: "string", enum: ["add", "remove"] }, removeAllTags: { type: "boolean" } }, required: ["contactIds", "tags", "operation"] } },
  { name: "bulk_update_contact_business", description: "Bulk assign or unassign a business to contacts.", inputSchema: { type: "object", properties: { contactIds: { type: "array", items: { type: "string" } }, businessId: { type: "string" } }, required: ["contactIds"] } },
  { name: "add_contact_followers", description: "Add followers to a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, followers: { type: "array", items: { type: "string" } } }, required: ["contactId", "followers"] } },
  { name: "remove_contact_followers", description: "Remove followers from a contact.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, followers: { type: "array", items: { type: "string" } } }, required: ["contactId", "followers"] } },
  { name: "add_contact_to_campaign", description: "Add a contact to a campaign.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, campaignId: { type: "string" } }, required: ["contactId", "campaignId"] } },
  { name: "remove_contact_from_campaign", description: "Remove a contact from a campaign.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, campaignId: { type: "string" } }, required: ["contactId", "campaignId"] } },
  { name: "remove_contact_from_all_campaigns", description: "Remove a contact from all campaigns.", inputSchema: { type: "object", properties: { contactId: { type: "string" } }, required: ["contactId"] } },
  { name: "add_contact_to_workflow", description: "Add a contact to a workflow.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, workflowId: { type: "string" }, eventStartTime: { type: "string" } }, required: ["contactId", "workflowId"] } },
  { name: "remove_contact_from_workflow", description: "Remove a contact from a workflow.", inputSchema: { type: "object", properties: { contactId: { type: "string" }, workflowId: { type: "string" }, eventStartTime: { type: "string" } }, required: ["contactId", "workflowId"] } },

  // ---- CONVERSATIONS (extended) ----
  { name: "create_conversation", description: "Create a new conversation.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, contactId: { type: "string" } }, required: ["locationId", "contactId"] } },
  { name: "update_conversation", description: "Update conversation properties.", inputSchema: { type: "object", properties: { conversationId: { type: "string" }, locationId: { type: "string" }, unreadCount: { type: "number" }, starred: { type: "boolean" } }, required: ["conversationId"] } },
  { name: "delete_conversation", description: "Delete a conversation.", inputSchema: { type: "object", properties: { conversationId: { type: "string" } }, required: ["conversationId"] } },
  { name: "get_message", description: "Get a specific message by ID.", inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] } },
  { name: "get_email_message", description: "Get a specific email message.", inputSchema: { type: "object", properties: { emailMessageId: { type: "string" } }, required: ["emailMessageId"] } },
  { name: "cancel_scheduled_email", description: "Cancel a scheduled email.", inputSchema: { type: "object", properties: { emailMessageId: { type: "string" } }, required: ["emailMessageId"] } },
  { name: "cancel_scheduled_message", description: "Cancel a scheduled message.", inputSchema: { type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"] } },
  { name: "add_inbound_message", description: "Add an inbound message to a conversation.", inputSchema: { type: "object", properties: { type: { type: "string" }, conversationId: { type: "string" }, contactId: { type: "string" }, message: { type: "string" }, attachments: { type: "array" } }, required: ["type"] } },
  { name: "add_outbound_call", description: "Log an outbound call to a conversation.", inputSchema: { type: "object", properties: { conversationId: { type: "string" }, contactId: { type: "string" }, userId: { type: "string" }, direction: { type: "string" } }, required: [] } },
  { name: "update_message_status", description: "Update the status of a message.", inputSchema: { type: "object", properties: { messageId: { type: "string" }, status: { type: "string" }, error: { type: "object" } }, required: ["messageId", "status"] } },
  { name: "get_message_recording", description: "Get the recording of a call message.", inputSchema: { type: "object", properties: { messageId: { type: "string" }, locationId: { type: "string" } }, required: ["messageId", "locationId"] } },
  { name: "get_message_transcription", description: "Get the transcription of a call message.", inputSchema: { type: "object", properties: { messageId: { type: "string" }, locationId: { type: "string" } }, required: ["messageId", "locationId"] } },
  { name: "download_message_transcription", description: "Download the transcription of a call message.", inputSchema: { type: "object", properties: { messageId: { type: "string" }, locationId: { type: "string" } }, required: ["messageId", "locationId"] } },
  { name: "live_chat_typing", description: "Send typing indicator for live chat.", inputSchema: { type: "object", properties: { conversationId: { type: "string" }, userId: { type: "string" }, typing: { type: "boolean" } }, required: ["conversationId"] } },

  // ---- OPPORTUNITIES (extended) ----
  { name: "get_opportunity", description: "Get an opportunity by ID.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" } }, required: ["opportunityId"] } },
  { name: "update_opportunity_status", description: "Update the status of an opportunity.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" }, status: { type: "string" } }, required: ["opportunityId", "status"] } },
  { name: "upsert_opportunity", description: "Create or update an opportunity.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, pipelineId: { type: "string" }, name: { type: "string" }, pipelineStageId: { type: "string" }, status: { type: "string" }, contactId: { type: "string" }, monetaryValue: { type: "number" }, assignedTo: { type: "string" } }, required: ["locationId", "pipelineId", "name"] } },
  { name: "add_opportunity_followers", description: "Add followers to an opportunity.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" }, followers: { type: "array", items: { type: "string" } } }, required: ["opportunityId", "followers"] } },
  { name: "remove_opportunity_followers", description: "Remove followers from an opportunity.", inputSchema: { type: "object", properties: { opportunityId: { type: "string" }, followers: { type: "array", items: { type: "string" } } }, required: ["opportunityId", "followers"] } },

  // ---- CALENDAR (extended) ----
  { name: "get_calendar_groups", description: "Get calendar groups for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },
  { name: "create_calendar_group", description: "Create a calendar group.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, slug: { type: "string" } }, required: ["locationId", "name"] } },
  { name: "update_calendar_group", description: "Update a calendar group.", inputSchema: { type: "object", properties: { groupId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, slug: { type: "string" } }, required: ["groupId"] } },
  { name: "delete_calendar_group", description: "Delete a calendar group.", inputSchema: { type: "object", properties: { groupId: { type: "string" } }, required: ["groupId"] } },
  { name: "disable_calendar_group", description: "Enable or disable a calendar group.", inputSchema: { type: "object", properties: { groupId: { type: "string" }, isActive: { type: "boolean" } }, required: ["groupId", "isActive"] } },
  { name: "validate_calendar_group_slug", description: "Validate a slug for a calendar group.", inputSchema: { type: "object", properties: { slug: { type: "string" }, locationId: { type: "string" } }, required: ["slug", "locationId"] } },
  { name: "create_calendar", description: "Create a calendar.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, slug: { type: "string" }, calendarType: { type: "string" }, groupId: { type: "string" } }, required: ["locationId", "name"] } },
  { name: "get_calendar", description: "Get a calendar by ID.", inputSchema: { type: "object", properties: { calendarId: { type: "string" } }, required: ["calendarId"] } },
  { name: "update_calendar", description: "Update a calendar.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, slug: { type: "string" }, calendarType: { type: "string" }, groupId: { type: "string" } }, required: ["calendarId"] } },
  { name: "delete_calendar", description: "Delete a calendar.", inputSchema: { type: "object", properties: { calendarId: { type: "string" } }, required: ["calendarId"] } },
  { name: "get_free_slots", description: "Get free time slots for a calendar.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" }, timezone: { type: "string" }, userId: { type: "string" } }, required: ["calendarId", "startDate", "endDate"] } },
  { name: "get_blocked_slots", description: "Get blocked time slots for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" }, calendarId: { type: "string" }, userId: { type: "string" } }, required: ["locationId", "startTime", "endTime"] } },
  { name: "create_appointment", description: "Create an appointment on a calendar.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, calendarId: { type: "string" }, contactId: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" }, title: { type: "string" }, appointmentStatus: { type: "string" }, assignedUserId: { type: "string" }, address: { type: "string" }, notes: { type: "string" }, ignoreDateRange: { type: "boolean" }, toNotify: { type: "boolean" } }, required: ["locationId", "calendarId", "contactId", "startTime"] } },
  { name: "get_appointment", description: "Get an appointment by ID.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } },
  { name: "update_appointment", description: "Update an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" }, title: { type: "string" }, appointmentStatus: { type: "string" }, assignedUserId: { type: "string" }, address: { type: "string" }, notes: { type: "string" } }, required: ["appointmentId"] } },
  { name: "delete_appointment", description: "Delete an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } },
  { name: "create_block_slot", description: "Create a blocked time slot.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, calendarId: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" }, title: { type: "string" }, assignedUserId: { type: "string" } }, required: ["locationId", "startTime", "endTime"] } },
  { name: "update_block_slot", description: "Update a blocked time slot.", inputSchema: { type: "object", properties: { blockSlotId: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" }, title: { type: "string" }, calendarId: { type: "string" }, assignedUserId: { type: "string" } }, required: ["blockSlotId"] } },
  { name: "get_appointment_notes", description: "Get notes for an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["appointmentId"] } },
  { name: "create_appointment_note", description: "Create a note on an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" }, body: { type: "string" }, userId: { type: "string" } }, required: ["appointmentId", "body"] } },
  { name: "update_appointment_note", description: "Update a note on an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" }, noteId: { type: "string" }, body: { type: "string" }, userId: { type: "string" } }, required: ["appointmentId", "noteId", "body"] } },
  { name: "delete_appointment_note", description: "Delete a note from an appointment.", inputSchema: { type: "object", properties: { appointmentId: { type: "string" }, noteId: { type: "string" } }, required: ["appointmentId", "noteId"] } },
  { name: "get_calendar_resources", description: "Get calendar resources (equipment or rooms).", inputSchema: { type: "object", properties: { resourceType: { type: "string" }, locationId: { type: "string" }, limit: { type: "number" }, skip: { type: "number" } }, required: ["resourceType", "locationId"] } },
  { name: "create_calendar_resource", description: "Create a calendar resource.", inputSchema: { type: "object", properties: { resourceType: { type: "string" }, locationId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, quantity: { type: "number" }, isActive: { type: "boolean" } }, required: ["resourceType", "locationId", "name"] } },
  { name: "get_calendar_resource", description: "Get a specific calendar resource.", inputSchema: { type: "object", properties: { resourceType: { type: "string" }, resourceId: { type: "string" } }, required: ["resourceType", "resourceId"] } },
  { name: "update_calendar_resource", description: "Update a calendar resource.", inputSchema: { type: "object", properties: { resourceType: { type: "string" }, resourceId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, quantity: { type: "number" }, isActive: { type: "boolean" } }, required: ["resourceType", "resourceId"] } },
  { name: "delete_calendar_resource", description: "Delete a calendar resource.", inputSchema: { type: "object", properties: { resourceType: { type: "string" }, resourceId: { type: "string" } }, required: ["resourceType", "resourceId"] } },
  { name: "get_calendar_notifications", description: "Get notifications for a calendar.", inputSchema: { type: "object", properties: { calendarId: { type: "string" } }, required: ["calendarId"] } },
  { name: "create_calendar_notification", description: "Create a notification for a calendar.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, type: { type: "string" }, channel: { type: "string" }, recipients: { type: "array" }, body: { type: "string" }, subject: { type: "string" } }, required: ["calendarId", "type", "channel"] } },
  { name: "get_calendar_notification", description: "Get a specific calendar notification.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, notificationId: { type: "string" } }, required: ["calendarId", "notificationId"] } },
  { name: "update_calendar_notification", description: "Update a calendar notification.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, notificationId: { type: "string" }, type: { type: "string" }, channel: { type: "string" }, recipients: { type: "array" }, body: { type: "string" }, subject: { type: "string" } }, required: ["calendarId", "notificationId"] } },
  { name: "delete_calendar_notification", description: "Delete a calendar notification.", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, notificationId: { type: "string" } }, required: ["calendarId", "notificationId"] } },

  // ---- LOCATION (extended) ----
  { name: "get_location_by_id", description: "Get a location by ID.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },
  { name: "create_location", description: "Create a new sub-account location.", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, city: { type: "string" }, state: { type: "string" }, country: { type: "string" }, postalCode: { type: "string" }, website: { type: "string" }, timezone: { type: "string" }, companyId: { type: "string" } }, required: ["name"] } },
  { name: "update_location", description: "Update a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, city: { type: "string" }, state: { type: "string" }, country: { type: "string" }, postalCode: { type: "string" }, website: { type: "string" }, timezone: { type: "string" } }, required: ["locationId"] } },
  { name: "delete_location", description: "Delete a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, deleteTwilioAccount: { type: "boolean" } }, required: ["locationId"] } },
  { name: "get_location_tags", description: "Get tags for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },
  { name: "create_location_tag", description: "Create a tag for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" } }, required: ["locationId", "name"] } },
  { name: "get_location_tag", description: "Get a specific location tag.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, tagId: { type: "string" } }, required: ["locationId", "tagId"] } },
  { name: "update_location_tag", description: "Update a location tag.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, tagId: { type: "string" }, name: { type: "string" } }, required: ["locationId", "tagId", "name"] } },
  { name: "delete_location_tag", description: "Delete a location tag.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, tagId: { type: "string" } }, required: ["locationId", "tagId"] } },
  { name: "search_location_tasks", description: "Search tasks for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, status: { type: "string" }, assignedTo: { type: "string" }, contactId: { type: "string" }, limit: { type: "number" }, skip: { type: "number" } }, required: ["locationId"] } },
  { name: "get_location_custom_fields", description: "Get custom fields for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, model: { type: "string" } }, required: ["locationId"] } },
  { name: "create_location_custom_field", description: "Create a custom field for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, fieldKey: { type: "string" }, dataType: { type: "string" }, model: { type: "string" }, placeholder: { type: "string" }, options: { type: "array" } }, required: ["locationId", "name", "fieldKey", "dataType"] } },
  { name: "get_location_custom_field", description: "Get a specific custom field for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, customFieldId: { type: "string" } }, required: ["locationId", "customFieldId"] } },
  { name: "update_location_custom_field", description: "Update a custom field for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, customFieldId: { type: "string" }, name: { type: "string" }, placeholder: { type: "string" }, options: { type: "array" } }, required: ["locationId", "customFieldId"] } },
  { name: "delete_location_custom_field", description: "Delete a custom field from a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, customFieldId: { type: "string" } }, required: ["locationId", "customFieldId"] } },
  { name: "get_location_custom_values", description: "Get custom values for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },
  { name: "create_location_custom_value", description: "Create a custom value for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, fieldKey: { type: "string" }, value: { type: "string" } }, required: ["locationId", "name", "fieldKey"] } },
  { name: "get_location_custom_value", description: "Get a specific custom value for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, customValueId: { type: "string" } }, required: ["locationId", "customValueId"] } },
  { name: "update_location_custom_value", description: "Update a custom value for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, customValueId: { type: "string" }, name: { type: "string" }, value: { type: "string" } }, required: ["locationId", "customValueId"] } },
  { name: "delete_location_custom_value", description: "Delete a custom value from a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, customValueId: { type: "string" } }, required: ["locationId", "customValueId"] } },
  { name: "get_location_templates", description: "Get templates for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, originId: { type: "string" }, type: { type: "string" }, deleted: { type: "boolean" }, skip: { type: "number" }, limit: { type: "number" } }, required: ["locationId", "originId"] } },
  { name: "delete_location_template", description: "Delete a template from a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, templateId: { type: "string" } }, required: ["locationId", "templateId"] } },
  { name: "get_timezones", description: "Get available timezones.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: [] } },

  // ---- BLOG ----
  { name: "get_blog_sites", description: "Get blog sites for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, skip: { type: "number" }, limit: { type: "number" }, searchTerm: { type: "string" } }, required: ["locationId"] } },
  { name: "get_blog_posts", description: "Get blog posts for a blog.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, blogId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, searchTerm: { type: "string" }, status: { type: "string" } }, required: ["locationId", "blogId"] } },
  { name: "create_blog_post", description: "Create a blog post.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, blogId: { type: "string" }, title: { type: "string" }, rawHTML: { type: "string" }, imageUrl: { type: "string" }, imageAltText: { type: "string" }, description: { type: "string" }, author: { type: "string" }, categories: { type: "array" }, tags: { type: "array" }, publishedAt: { type: "string" }, urlSlug: { type: "string" }, status: { type: "string" } }, required: ["locationId", "blogId", "title", "rawHTML"] } },
  { name: "update_blog_post", description: "Update a blog post.", inputSchema: { type: "object", properties: { postId: { type: "string" }, locationId: { type: "string" }, title: { type: "string" }, rawHTML: { type: "string" }, imageUrl: { type: "string" }, imageAltText: { type: "string" }, description: { type: "string" }, author: { type: "string" }, categories: { type: "array" }, tags: { type: "array" }, urlSlug: { type: "string" }, status: { type: "string" } }, required: ["postId", "locationId"] } },
  { name: "get_blog_authors", description: "Get authors for a blog.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "get_blog_categories", description: "Get categories for a blog.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "check_blog_url_slug", description: "Check if a blog URL slug is available.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, urlSlug: { type: "string" }, postId: { type: "string" } }, required: ["locationId", "urlSlug"] } },

  // ---- EMAIL ----
  { name: "get_email_campaigns", description: "Get email campaigns/schedules for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "create_email_template", description: "Create an email template.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, title: { type: "string" }, html: { type: "string" }, previewText: { type: "string" }, isPlainText: { type: "boolean" } }, required: ["locationId", "title", "html"] } },
  { name: "get_email_templates", description: "Get email templates for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "update_email_template", description: "Update an email template.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, templateId: { type: "string" }, title: { type: "string" }, html: { type: "string" }, previewText: { type: "string" } }, required: ["locationId", "templateId"] } },
  { name: "delete_email_template", description: "Delete an email template.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, templateId: { type: "string" } }, required: ["locationId", "templateId"] } },
  { name: "verify_email", description: "Verify an email address.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, type: { type: "string" }, verify: { type: "string" } }, required: ["locationId", "type", "verify"] } },

  // ---- INVOICES ----
  { name: "create_invoice_template", description: "Create an invoice template.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, currency: { type: "string" }, items: { type: "array" }, businessDetails: { type: "object" }, discount: { type: "object" }, termsNotes: { type: "string" }, title: { type: "string" } }, required: ["altId"] } },
  { name: "list_invoice_templates", description: "List invoice templates.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, status: { type: "string" }, startAt: { type: "string" }, endAt: { type: "string" }, search: { type: "string" }, limit: { type: "string" }, offset: { type: "string" } }, required: ["altId"] } },
  { name: "get_invoice_template", description: "Get a specific invoice template.", inputSchema: { type: "object", properties: { templateId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["templateId", "altId"] } },
  { name: "update_invoice_template", description: "Update an invoice template.", inputSchema: { type: "object", properties: { templateId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, currency: { type: "string" }, items: { type: "array" } }, required: ["templateId", "altId"] } },
  { name: "delete_invoice_template", description: "Delete an invoice template.", inputSchema: { type: "object", properties: { templateId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["templateId", "altId"] } },
  { name: "create_invoice_schedule", description: "Create a recurring invoice schedule.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, currency: { type: "string" }, contactId: { type: "string" }, items: { type: "array" }, discount: { type: "object" } }, required: ["altId", "contactId"] } },
  { name: "list_invoice_schedules", description: "List invoice schedules.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, status: { type: "string" }, limit: { type: "string" }, offset: { type: "string" } }, required: ["altId"] } },
  { name: "get_invoice_schedule", description: "Get a specific invoice schedule.", inputSchema: { type: "object", properties: { scheduleId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["scheduleId", "altId"] } },
  { name: "delete_invoice_schedule", description: "Delete an invoice schedule.", inputSchema: { type: "object", properties: { scheduleId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["scheduleId", "altId"] } },
  { name: "cancel_invoice_schedule", description: "Cancel an invoice schedule.", inputSchema: { type: "object", properties: { scheduleId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["scheduleId", "altId"] } },
  { name: "generate_invoice_number", description: "Generate a unique invoice number.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" } }, required: ["altId"] } },
  { name: "create_invoice", description: "Create an invoice.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, contactId: { type: "string" }, currency: { type: "string" }, items: { type: "array" }, discount: { type: "object" }, title: { type: "string" }, dueDate: { type: "string" }, termsNotes: { type: "string" } }, required: ["altId", "contactId"] } },
  { name: "list_invoices", description: "List invoices.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, status: { type: "string" }, contactId: { type: "string" }, startAt: { type: "string" }, endAt: { type: "string" }, limit: { type: "string" }, offset: { type: "string" } }, required: ["altId"] } },
  { name: "get_invoice", description: "Get a specific invoice.", inputSchema: { type: "object", properties: { invoiceId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["invoiceId", "altId"] } },
  { name: "update_invoice", description: "Update an invoice.", inputSchema: { type: "object", properties: { invoiceId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, contactId: { type: "string" }, currency: { type: "string" }, items: { type: "array" }, discount: { type: "object" }, title: { type: "string" }, dueDate: { type: "string" } }, required: ["invoiceId", "altId"] } },
  { name: "delete_invoice", description: "Delete an invoice.", inputSchema: { type: "object", properties: { invoiceId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["invoiceId", "altId"] } },
  { name: "send_invoice", description: "Send an invoice to a contact.", inputSchema: { type: "object", properties: { invoiceId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, action: { type: "string" }, userId: { type: "string" } }, required: ["invoiceId", "altId"] } },
  { name: "record_invoice_payment", description: "Record a manual payment for an invoice.", inputSchema: { type: "object", properties: { invoiceId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, mode: { type: "string" }, amount: { type: "number" }, notes: { type: "string" } }, required: ["invoiceId", "altId"] } },
  { name: "void_invoice", description: "Void an invoice.", inputSchema: { type: "object", properties: { invoiceId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["invoiceId", "altId"] } },
  { name: "text2pay_invoice", description: "Create a text2pay invoice link.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, contactId: { type: "string" }, currency: { type: "string" }, items: { type: "array" } }, required: ["altId", "contactId"] } },

  // ---- PAYMENTS ----
  { name: "list_orders", description: "List payment orders.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, status: { type: "string" }, startAt: { type: "string" }, endAt: { type: "string" }, contactId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "get_order", description: "Get a specific order.", inputSchema: { type: "object", properties: { orderId: { type: "string" }, locationId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["orderId"] } },
  { name: "create_order_fulfillment", description: "Create a fulfillment for an order.", inputSchema: { type: "object", properties: { orderId: { type: "string" }, locationId: { type: "string" }, trackingNumber: { type: "string" }, trackingUrl: { type: "string" }, items: { type: "array" } }, required: ["orderId"] } },
  { name: "list_order_fulfillments", description: "List fulfillments for an order.", inputSchema: { type: "object", properties: { orderId: { type: "string" }, locationId: { type: "string" } }, required: ["orderId"] } },
  { name: "list_transactions", description: "List payment transactions.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, status: { type: "string" }, contactId: { type: "string" }, startAt: { type: "string" }, endAt: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "get_transaction", description: "Get a specific transaction.", inputSchema: { type: "object", properties: { transactionId: { type: "string" }, locationId: { type: "string" } }, required: ["transactionId"] } },
  { name: "list_subscriptions", description: "List payment subscriptions.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, status: { type: "string" }, contactId: { type: "string" }, startAt: { type: "string" }, endAt: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "get_subscription", description: "Get a specific subscription.", inputSchema: { type: "object", properties: { subscriptionId: { type: "string" }, locationId: { type: "string" } }, required: ["subscriptionId"] } },
  { name: "list_coupons", description: "List coupons.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, status: { type: "string" }, search: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "get_coupon", description: "Get a coupon by code.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, couponCode: { type: "string" } }, required: ["locationId"] } },
  { name: "create_coupon", description: "Create a coupon.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, code: { type: "string" }, discountType: { type: "string" }, discountValue: { type: "number" }, expiryDate: { type: "string" }, maxUses: { type: "number" }, productIds: { type: "array" } }, required: ["locationId", "name", "code"] } },
  { name: "update_coupon", description: "Update a coupon.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, couponId: { type: "string" }, name: { type: "string" }, discountType: { type: "string" }, discountValue: { type: "number" }, expiryDate: { type: "string" }, maxUses: { type: "number" } }, required: ["locationId", "couponId"] } },
  { name: "delete_coupon", description: "Delete a coupon.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, couponId: { type: "string" } }, required: ["locationId", "couponId"] } },

  // ---- PRODUCTS ----
  { name: "create_product", description: "Create a product.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, productType: { type: "string" }, currency: { type: "string" }, image: { type: "string" }, statementDescriptor: { type: "string" }, availableInStore: { type: "boolean" } }, required: ["locationId", "name"] } },
  { name: "get_product", description: "Get a product by ID.", inputSchema: { type: "object", properties: { productId: { type: "string" }, locationId: { type: "string" } }, required: ["productId", "locationId"] } },
  { name: "update_product", description: "Update a product.", inputSchema: { type: "object", properties: { productId: { type: "string" }, locationId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, productType: { type: "string" }, currency: { type: "string" }, image: { type: "string" }, availableInStore: { type: "boolean" } }, required: ["productId"] } },
  { name: "delete_product", description: "Delete a product.", inputSchema: { type: "object", properties: { productId: { type: "string" }, locationId: { type: "string" } }, required: ["productId", "locationId"] } },
  { name: "list_products", description: "List products.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, search: { type: "string" }, collectionIds: { type: "string" }, availableInStore: { type: "boolean" } }, required: ["locationId"] } },
  { name: "create_product_price", description: "Create a price for a product.", inputSchema: { type: "object", properties: { productId: { type: "string" }, locationId: { type: "string" }, name: { type: "string" }, amount: { type: "number" }, type: { type: "string" }, currency: { type: "string" }, billingCycle: { type: "string" }, trialDays: { type: "number" } }, required: ["productId", "locationId", "name", "amount"] } },
  { name: "list_product_prices", description: "List prices for a product.", inputSchema: { type: "object", properties: { productId: { type: "string" }, locationId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["productId", "locationId"] } },
  { name: "get_product_price", description: "Get a specific product price.", inputSchema: { type: "object", properties: { productId: { type: "string" }, priceId: { type: "string" }, locationId: { type: "string" } }, required: ["productId", "priceId", "locationId"] } },
  { name: "update_product_price", description: "Update a product price.", inputSchema: { type: "object", properties: { productId: { type: "string" }, priceId: { type: "string" }, locationId: { type: "string" }, name: { type: "string" }, amount: { type: "number" }, currency: { type: "string" } }, required: ["productId", "priceId"] } },
  { name: "delete_product_price", description: "Delete a product price.", inputSchema: { type: "object", properties: { productId: { type: "string" }, priceId: { type: "string" }, locationId: { type: "string" } }, required: ["productId", "priceId", "locationId"] } },
  { name: "list_inventory", description: "List inventory.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, productId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "create_product_collection", description: "Create a product collection.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, description: { type: "string" }, seoTitle: { type: "string" }, seoDescription: { type: "string" } }, required: ["locationId", "name"] } },
  { name: "list_product_collections", description: "List product collections.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "delete_product_collection", description: "Delete a product collection.", inputSchema: { type: "object", properties: { collectionId: { type: "string" }, locationId: { type: "string" } }, required: ["collectionId", "locationId"] } },
  { name: "list_product_reviews", description: "List product reviews.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, productId: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["locationId"] } },
  { name: "update_product_review", description: "Update a product review.", inputSchema: { type: "object", properties: { reviewId: { type: "string" }, locationId: { type: "string" }, status: { type: "string" }, reply: { type: "string" } }, required: ["reviewId", "locationId"] } },
  { name: "delete_product_review", description: "Delete a product review.", inputSchema: { type: "object", properties: { reviewId: { type: "string" }, locationId: { type: "string" } }, required: ["reviewId", "locationId"] } },

  // ---- SOCIAL MEDIA ----
  { name: "search_social_posts", description: "Search social media posts.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, skip: { type: "number" }, limit: { type: "number" }, accountIds: { type: "array" }, status: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" } }, required: ["locationId"] } },
  { name: "create_social_post", description: "Create a social media post.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, type: { type: "string" }, accountIds: { type: "array", items: { type: "string" } }, summary: { type: "string" }, scheduledAt: { type: "string" }, mediaUrls: { type: "array" }, tags: { type: "array" }, categoryIds: { type: "array" } }, required: ["locationId", "type", "accountIds"] } },
  { name: "get_social_post", description: "Get a social media post.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, postId: { type: "string" } }, required: ["locationId", "postId"] } },
  { name: "update_social_post", description: "Update a social media post.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, postId: { type: "string" }, summary: { type: "string" }, scheduledAt: { type: "string" }, mediaUrls: { type: "array" }, tags: { type: "array" }, categoryIds: { type: "array" } }, required: ["locationId", "postId"] } },
  { name: "delete_social_post", description: "Delete a social media post.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, postId: { type: "string" } }, required: ["locationId", "postId"] } },
  { name: "bulk_delete_social_posts", description: "Bulk delete social media posts.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, postIds: { type: "array", items: { type: "string" } } }, required: ["locationId", "postIds"] } },
  { name: "get_social_accounts", description: "Get social media accounts for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },
  { name: "delete_social_account", description: "Delete a social media account.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, accountId: { type: "string" }, companyId: { type: "string" }, userId: { type: "string" } }, required: ["locationId", "accountId"] } },
  { name: "get_social_csv_upload_status", description: "Get the CSV upload status for social posts.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, skip: { type: "number" }, limit: { type: "number" }, includeUsers: { type: "boolean" }, userId: { type: "string" } }, required: ["locationId"] } },
  { name: "get_social_csv_posts", description: "Get posts from a social CSV upload.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, csvId: { type: "string" }, skip: { type: "number" }, limit: { type: "number" } }, required: ["locationId", "csvId"] } },
  { name: "delete_social_csv", description: "Delete a social CSV upload.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, csvId: { type: "string" } }, required: ["locationId", "csvId"] } },
  { name: "delete_social_csv_post", description: "Delete a specific post from a social CSV.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, csvId: { type: "string" }, postId: { type: "string" } }, required: ["locationId", "csvId", "postId"] } },

  // ---- SURVEYS ----
  { name: "get_surveys", description: "Get surveys for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, skip: { type: "number" }, limit: { type: "number" }, type: { type: "string" } }, required: ["locationId"] } },
  { name: "get_survey_submissions", description: "Get survey submissions for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, surveyId: { type: "string" }, page: { type: "number" }, limit: { type: "number" }, q: { type: "string" }, startAt: { type: "string" }, endAt: { type: "string" } }, required: ["locationId"] } },

  // ---- WORKFLOWS ----
  { name: "get_workflows", description: "Get workflows for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },

  // ---- MEDIA ----
  { name: "get_media_files", description: "Get media files.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, sortBy: { type: "string" }, sortOrder: { type: "string" }, type: { type: "string" }, query: { type: "string" }, parentId: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, required: ["altId"] } },
  { name: "delete_media_file", description: "Delete a media file.", inputSchema: { type: "object", properties: { id: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["id", "altId"] } },

  // ---- CUSTOM FIELDS V2 ----
  { name: "get_custom_field_v2_by_id", description: "Get a custom field V2 by ID.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "create_custom_field_v2", description: "Create a custom field V2.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, dataType: { type: "string" }, fieldKey: { type: "string" }, objectKey: { type: "string" }, parentId: { type: "string" }, name: { type: "string" }, placeholder: { type: "string" }, isRequired: { type: "boolean" }, options: { type: "array" } }, required: ["locationId", "dataType", "fieldKey", "objectKey"] } },
  { name: "update_custom_field_v2", description: "Update a custom field V2.", inputSchema: { type: "object", properties: { id: { type: "string" }, locationId: { type: "string" }, name: { type: "string" }, placeholder: { type: "string" }, options: { type: "array" } }, required: ["id"] } },
  { name: "delete_custom_field_v2", description: "Delete a custom field V2.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "get_custom_fields_v2_by_object_key", description: "Get custom fields V2 by object key.", inputSchema: { type: "object", properties: { objectKey: { type: "string" }, locationId: { type: "string" } }, required: ["objectKey", "locationId"] } },
  { name: "create_custom_field_folder", description: "Create a custom field folder.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, name: { type: "string" }, objectKey: { type: "string" } }, required: ["locationId", "name", "objectKey"] } },
  { name: "update_custom_field_folder", description: "Update a custom field folder.", inputSchema: { type: "object", properties: { id: { type: "string" }, locationId: { type: "string" }, name: { type: "string" } }, required: ["id", "locationId", "name"] } },
  { name: "delete_custom_field_folder", description: "Delete a custom field folder.", inputSchema: { type: "object", properties: { id: { type: "string" }, locationId: { type: "string" } }, required: ["id", "locationId"] } },

  // ---- STORE / SHIPPING ----
  { name: "create_shipping_zone", description: "Create a shipping zone.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, countries: { type: "array" } }, required: ["altId", "name"] } },
  { name: "list_shipping_zones", description: "List shipping zones.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, withShippingRate: { type: "boolean" } }, required: ["altId"] } },
  { name: "get_shipping_zone", description: "Get a shipping zone.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, withShippingRate: { type: "boolean" } }, required: ["shippingZoneId", "altId"] } },
  { name: "update_shipping_zone", description: "Update a shipping zone.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, countries: { type: "array" } }, required: ["shippingZoneId", "altId"] } },
  { name: "delete_shipping_zone", description: "Delete a shipping zone.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["shippingZoneId", "altId"] } },
  { name: "create_shipping_rate", description: "Create a shipping rate.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, type: { type: "string" }, amount: { type: "number" }, minOrderAmount: { type: "number" }, maxOrderAmount: { type: "number" } }, required: ["shippingZoneId", "altId", "name"] } },
  { name: "list_shipping_rates", description: "List shipping rates.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["shippingZoneId", "altId"] } },
  { name: "get_shipping_rate", description: "Get a specific shipping rate.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, shippingRateId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["shippingZoneId", "shippingRateId", "altId"] } },
  { name: "update_shipping_rate", description: "Update a shipping rate.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, shippingRateId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, type: { type: "string" }, amount: { type: "number" } }, required: ["shippingZoneId", "shippingRateId", "altId"] } },
  { name: "delete_shipping_rate", description: "Delete a shipping rate.", inputSchema: { type: "object", properties: { shippingZoneId: { type: "string" }, shippingRateId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["shippingZoneId", "shippingRateId", "altId"] } },
  { name: "create_shipping_carrier", description: "Create a shipping carrier.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, services: { type: "array" } }, required: ["altId", "name"] } },
  { name: "list_shipping_carriers", description: "List shipping carriers.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" } }, required: ["altId"] } },
  { name: "get_shipping_carrier", description: "Get a shipping carrier.", inputSchema: { type: "object", properties: { shippingCarrierId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["shippingCarrierId", "altId"] } },
  { name: "update_shipping_carrier", description: "Update a shipping carrier.", inputSchema: { type: "object", properties: { shippingCarrierId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" }, name: { type: "string" }, services: { type: "array" } }, required: ["shippingCarrierId", "altId"] } },
  { name: "delete_shipping_carrier", description: "Delete a shipping carrier.", inputSchema: { type: "object", properties: { shippingCarrierId: { type: "string" }, altId: { type: "string" }, altType: { type: "string" } }, required: ["shippingCarrierId", "altId"] } },
  { name: "create_store_setting", description: "Create or update store settings.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" }, originAddress: { type: "object" }, notificationEmails: { type: "array" } }, required: ["altId"] } },
  { name: "get_store_setting", description: "Get store settings.", inputSchema: { type: "object", properties: { altId: { type: "string" }, altType: { type: "string" } }, required: ["altId"] } },

  // ---- ASSOCIATIONS ----
  { name: "get_all_associations", description: "Get all associations for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, skip: { type: "number" }, limit: { type: "number" } }, required: ["locationId"] } },
  { name: "create_association", description: "Create an association between object types.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, label: { type: "string" }, key: { type: "string" }, fromObjectKey: { type: "string" }, toObjectKey: { type: "string" }, reverse: { type: "object" } }, required: ["locationId", "label", "fromObjectKey", "toObjectKey"] } },
  { name: "get_association_by_id", description: "Get an association by ID.", inputSchema: { type: "object", properties: { associationId: { type: "string" } }, required: ["associationId"] } },
  { name: "get_association_by_key", description: "Get an association by key name.", inputSchema: { type: "object", properties: { keyName: { type: "string" }, locationId: { type: "string" } }, required: ["keyName", "locationId"] } },
  { name: "get_association_by_object_key", description: "Get associations by object key.", inputSchema: { type: "object", properties: { objectKey: { type: "string" }, locationId: { type: "string" } }, required: ["objectKey"] } },
  { name: "update_association", description: "Update an association.", inputSchema: { type: "object", properties: { associationId: { type: "string" }, label: { type: "string" }, reverse: { type: "object" } }, required: ["associationId"] } },
  { name: "delete_association", description: "Delete an association.", inputSchema: { type: "object", properties: { associationId: { type: "string" } }, required: ["associationId"] } },
  { name: "create_relation", description: "Create a relation between two records.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, associationId: { type: "string" }, firstRecordId: { type: "string" }, secondRecordId: { type: "string" } }, required: ["locationId", "associationId", "firstRecordId", "secondRecordId"] } },
  { name: "get_relations_by_record", description: "Get relations for a specific record.", inputSchema: { type: "object", properties: { recordId: { type: "string" }, locationId: { type: "string" }, skip: { type: "number" }, limit: { type: "number" }, associationIds: { type: "string" } }, required: ["recordId", "locationId"] } },
  { name: "delete_relation", description: "Delete a relation.", inputSchema: { type: "object", properties: { relationId: { type: "string" }, locationId: { type: "string" } }, required: ["relationId", "locationId"] } },

  // ---- OBJECTS ----
  { name: "get_objects_by_location", description: "Get custom object schemas for a location.", inputSchema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },
  { name: "create_object_schema", description: "Create a custom object schema.", inputSchema: { type: "object", properties: { locationId: { type: "string" }, labels: { type: "object" }, key: { type: "string" }, properties: { type: "array" } }, required: ["locationId", "labels"] } },
  { name: "get_object_schema", description: "Get a custom object schema by key.", inputSchema: { type: "object", properties: { key: { type: "string" }, locationId: { type: "string" }, fetchProperties: { type: "boolean" } }, required: ["key", "locationId"] } },
  { name: "update_object_schema", description: "Update a custom object schema.", inputSchema: { type: "object", properties: { key: { type: "string" }, locationId: { type: "string" }, labels: { type: "object" }, properties: { type: "array" } }, required: ["key", "locationId"] } },
  { name: "create_object_record", description: "Create a record for a custom object.", inputSchema: { type: "object", properties: { schemaKey: { type: "string" }, locationId: { type: "string" }, properties: { type: "object" }, ownerId: { type: "string" }, followers: { type: "array" } }, required: ["schemaKey", "locationId"] } },
  { name: "get_object_record", description: "Get a custom object record.", inputSchema: { type: "object", properties: { schemaKey: { type: "string" }, recordId: { type: "string" } }, required: ["schemaKey", "recordId"] } },
  { name: "update_object_record", description: "Update a custom object record.", inputSchema: { type: "object", properties: { schemaKey: { type: "string" }, recordId: { type: "string" }, locationId: { type: "string" }, properties: { type: "object" }, ownerId: { type: "string" }, followers: { type: "array" } }, required: ["schemaKey", "recordId", "locationId"] } },
  { name: "delete_object_record", description: "Delete a custom object record.", inputSchema: { type: "object", properties: { schemaKey: { type: "string" }, recordId: { type: "string" } }, required: ["schemaKey", "recordId"] } },
  { name: "search_object_records", description: "Search records for a custom object.", inputSchema: { type: "object", properties: { schemaKey: { type: "string" }, locationId: { type: "string" }, query: { type: "object" }, searchAfter: { type: "array" }, limit: { type: "number" } }, required: ["schemaKey", "locationId"] } },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const GetSubAccountsInput = z.object({
  limit: z.number().optional().default(10),
  skip: z.number().optional().default(0),
});

const GetContactsInput = z.object({
  locationId: z.string(),
  limit: z.number().optional().default(20),
  query: z.string().optional(),
});

const CreateContactInput = z.object({
  locationId: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  website: z.string().optional(),
  companyName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
});

const GetConversationsInput = z.object({
  locationId: z.string(),
  limit: z.number().optional().default(20),
  query: z.string().optional(),
});

const SendMessageInput = z.object({
  conversationId: z.string(),
  type: z.enum(["SMS", "Email"]),
  message: z.string(),
});

const CreateApiKeyInput = z.object({
  locationId: z.string(),
  name: z.string(),
});

const GetBillingChargesInput = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  locationId: z.string().optional(),
  limit: z.number().optional().default(100),
  skip: z.number().optional().default(0),
});

async function handleGetSubAccounts(args) {
  const { limit, skip } = GetSubAccountsInput.parse(args);
  const params = new URLSearchParams({ limit, skip });
  const data = await ghl.get(`/locations/search?${params}`);
  return JSON.stringify(data, null, 2);
}

async function handleGetContacts(args) {
  const { locationId, limit, query } = GetContactsInput.parse(args);
  let path = `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=${limit}`;
  if (query) path += `&query=${encodeURIComponent(query)}`;
  const data = await ghl.locationGet(path);
  return JSON.stringify(data, null, 2);
}

async function handleCreateContact(args) {
  const { locationId, ...rest } = CreateContactInput.parse(args);
  const body = { locationId };
  const fields = [
    "firstName", "lastName", "email", "phone", "address1",
    "city", "state", "country", "postalCode", "website",
    "companyName", "tags", "source",
  ];
  for (const field of fields) {
    if (rest[field] !== undefined) body[field] = rest[field];
  }
  const data = await ghl.locationPost("/contacts/", body);
  return JSON.stringify(data, null, 2);
}

async function handleGetConversations(args) {
  const { locationId, limit, query } = GetConversationsInput.parse(args);
  let path = `/conversations/search?locationId=${encodeURIComponent(locationId)}&limit=${limit}`;
  if (query) path += `&query=${encodeURIComponent(query)}`;
  const data = await ghl.locationGet(path);
  return JSON.stringify(data, null, 2);
}

async function handleSendMessage(args) {
  const { conversationId, type, message } = SendMessageInput.parse(args);
  const body = { conversationId, type, message };
  const data = await ghl.locationPost("/conversations/messages", body);
  return JSON.stringify(data, null, 2);
}

async function handleCreateApiKey(args) {
  const { locationId, name } = CreateApiKeyInput.parse(args);
  const data = await ghl.post(
    `/locations/${encodeURIComponent(locationId)}/apiKeys`,
    { name }
  );
  return JSON.stringify(data, null, 2);
}

async function handleGetBillingCharges(args) {
  const { startDate, endDate, locationId, limit, skip } =
    GetBillingChargesInput.parse(args);

  let companyId = null;
  try {
    const whoami = await ghl.get("/oauth/installedLocations");
    companyId = whoami?.companyId || whoami?.data?.companyId || null;
  } catch {}

  if (!companyId) {
    try {
      const loc = await ghl.get("/locations/search?limit=1");
      companyId = loc?.locations?.[0]?.companyId || null;
    } catch {}
  }

  const params = new URLSearchParams({ limit, skip });
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (locationId) params.set("locationId", locationId);

  const endpoints = [
    companyId ? `/companies/${companyId}/wallet/transactions` : null,
    companyId ? `/companies/${companyId}/billing/transactions` : null,
    companyId
      ? `/saas-api/public-api/get-transactions?companyId=${companyId}`
      : null,
    `/lc-phone/transactions`,
    `/reporting/revenue`,
  ].filter(Boolean);

  const results = { companyId, endpoints: {} };
  for (const endpoint of endpoints) {
    try {
      const data = await ghl.get(
        endpoint.includes("?")
          ? `${endpoint}&${params}`
          : `${endpoint}?${params}`
      );
      results.endpoints[endpoint] = { success: true, data };
    } catch (err) {
      results.endpoints[endpoint] = { success: false, error: err.message };
    }
  }
  return JSON.stringify(results, null, 2);
}

const handlers = {
  get_sub_accounts: handleGetSubAccounts,
  get_contacts: handleGetContacts,
  create_contact: handleCreateContact,
  get_conversations: handleGetConversations,
  send_message: handleSendMessage,
  create_api_key: handleCreateApiKey,
  get_billing_charges: handleGetBillingCharges,

  // Contacts (extended)
  get_contact_tasks: (a) => ext.getContactTasks(a).then(r => JSON.stringify(r, null, 2)),
  create_contact_task: (a) => ext.createContactTask(a).then(r => JSON.stringify(r, null, 2)),
  get_contact_task: (a) => ext.getContactTask(a).then(r => JSON.stringify(r, null, 2)),
  update_contact_task: (a) => ext.updateContactTask(a).then(r => JSON.stringify(r, null, 2)),
  delete_contact_task: (a) => ext.deleteContactTask(a).then(r => JSON.stringify(r, null, 2)),
  update_task_completion: (a) => ext.updateTaskCompletion(a).then(r => JSON.stringify(r, null, 2)),
  get_contact_note: (a) => ext.getContactNote(a).then(r => JSON.stringify(r, null, 2)),
  update_contact_note: (a) => ext.updateContactNote(a).then(r => JSON.stringify(r, null, 2)),
  delete_contact_note: (a) => ext.deleteContactNote(a).then(r => JSON.stringify(r, null, 2)),
  upsert_contact: (a) => ext.upsertContact(a).then(r => JSON.stringify(r, null, 2)),
  get_duplicate_contact: (a) => ext.getDuplicateContact(a).then(r => JSON.stringify(r, null, 2)),
  get_contacts_by_business: (a) => ext.getContactsByBusiness(a).then(r => JSON.stringify(r, null, 2)),
  get_contact_appointments: (a) => ext.getContactAppointments(a).then(r => JSON.stringify(r, null, 2)),
  bulk_update_contact_tags: (a) => ext.bulkUpdateContactTags(a).then(r => JSON.stringify(r, null, 2)),
  bulk_update_contact_business: (a) => ext.bulkUpdateContactBusiness(a).then(r => JSON.stringify(r, null, 2)),
  add_contact_followers: (a) => ext.addContactFollowers(a).then(r => JSON.stringify(r, null, 2)),
  remove_contact_followers: (a) => ext.removeContactFollowers(a).then(r => JSON.stringify(r, null, 2)),
  add_contact_to_campaign: (a) => ext.addContactToCampaign(a).then(r => JSON.stringify(r, null, 2)),
  remove_contact_from_campaign: (a) => ext.removeContactFromCampaign(a).then(r => JSON.stringify(r, null, 2)),
  remove_contact_from_all_campaigns: (a) => ext.removeContactFromAllCampaigns(a).then(r => JSON.stringify(r, null, 2)),
  add_contact_to_workflow: (a) => ext.addContactToWorkflow(a).then(r => JSON.stringify(r, null, 2)),
  remove_contact_from_workflow: (a) => ext.removeContactFromWorkflow(a).then(r => JSON.stringify(r, null, 2)),

  // Conversations (extended)
  create_conversation: (a) => ext.createConversation(a).then(r => JSON.stringify(r, null, 2)),
  update_conversation: (a) => ext.updateConversation(a).then(r => JSON.stringify(r, null, 2)),
  delete_conversation: (a) => ext.deleteConversation(a).then(r => JSON.stringify(r, null, 2)),
  get_message: (a) => ext.getMessage(a).then(r => JSON.stringify(r, null, 2)),
  get_email_message: (a) => ext.getEmailMessage(a).then(r => JSON.stringify(r, null, 2)),
  cancel_scheduled_email: (a) => ext.cancelScheduledEmail(a).then(r => JSON.stringify(r, null, 2)),
  cancel_scheduled_message: (a) => ext.cancelScheduledMessage(a).then(r => JSON.stringify(r, null, 2)),
  add_inbound_message: (a) => ext.addInboundMessage(a).then(r => JSON.stringify(r, null, 2)),
  add_outbound_call: (a) => ext.addOutboundCall(a).then(r => JSON.stringify(r, null, 2)),
  update_message_status: (a) => ext.updateMessageStatus(a).then(r => JSON.stringify(r, null, 2)),
  get_message_recording: (a) => ext.getMessageRecording(a).then(r => JSON.stringify(r, null, 2)),
  get_message_transcription: (a) => ext.getMessageTranscription(a).then(r => JSON.stringify(r, null, 2)),
  download_message_transcription: (a) => ext.downloadMessageTranscription(a).then(r => JSON.stringify(r, null, 2)),
  live_chat_typing: (a) => ext.liveChatTyping(a).then(r => JSON.stringify(r, null, 2)),

  // Opportunities (extended)
  get_opportunity: (a) => ext.getOpportunity(a).then(r => JSON.stringify(r, null, 2)),
  update_opportunity_status: (a) => ext.updateOpportunityStatus(a).then(r => JSON.stringify(r, null, 2)),
  upsert_opportunity: (a) => ext.upsertOpportunity(a).then(r => JSON.stringify(r, null, 2)),
  add_opportunity_followers: (a) => ext.addOpportunityFollowers(a).then(r => JSON.stringify(r, null, 2)),
  remove_opportunity_followers: (a) => ext.removeOpportunityFollowers(a).then(r => JSON.stringify(r, null, 2)),

  // Calendar (extended)
  get_calendar_groups: (a) => ext.getCalendarGroups(a).then(r => JSON.stringify(r, null, 2)),
  create_calendar_group: (a) => ext.createCalendarGroup(a).then(r => JSON.stringify(r, null, 2)),
  update_calendar_group: (a) => ext.updateCalendarGroup(a).then(r => JSON.stringify(r, null, 2)),
  delete_calendar_group: (a) => ext.deleteCalendarGroup(a).then(r => JSON.stringify(r, null, 2)),
  disable_calendar_group: (a) => ext.disableCalendarGroup(a).then(r => JSON.stringify(r, null, 2)),
  validate_calendar_group_slug: (a) => ext.validateCalendarGroupSlug(a).then(r => JSON.stringify(r, null, 2)),
  create_calendar: (a) => ext.createCalendar(a).then(r => JSON.stringify(r, null, 2)),
  get_calendar: (a) => ext.getCalendar(a).then(r => JSON.stringify(r, null, 2)),
  update_calendar: (a) => ext.updateCalendar(a).then(r => JSON.stringify(r, null, 2)),
  delete_calendar: (a) => ext.deleteCalendar(a).then(r => JSON.stringify(r, null, 2)),
  get_free_slots: (a) => ext.getFreeSlots(a).then(r => JSON.stringify(r, null, 2)),
  get_blocked_slots: (a) => ext.getBlockedSlots(a).then(r => JSON.stringify(r, null, 2)),
  create_appointment: (a) => ext.createAppointment(a).then(r => JSON.stringify(r, null, 2)),
  get_appointment: (a) => ext.getAppointment(a).then(r => JSON.stringify(r, null, 2)),
  update_appointment: (a) => ext.updateAppointment(a).then(r => JSON.stringify(r, null, 2)),
  delete_appointment: (a) => ext.deleteAppointment(a).then(r => JSON.stringify(r, null, 2)),
  create_block_slot: (a) => ext.createBlockSlot(a).then(r => JSON.stringify(r, null, 2)),
  update_block_slot: (a) => ext.updateBlockSlot(a).then(r => JSON.stringify(r, null, 2)),
  get_appointment_notes: (a) => ext.getAppointmentNotes(a).then(r => JSON.stringify(r, null, 2)),
  create_appointment_note: (a) => ext.createAppointmentNote(a).then(r => JSON.stringify(r, null, 2)),
  update_appointment_note: (a) => ext.updateAppointmentNote(a).then(r => JSON.stringify(r, null, 2)),
  delete_appointment_note: (a) => ext.deleteAppointmentNote(a).then(r => JSON.stringify(r, null, 2)),
  get_calendar_resources: (a) => ext.getCalendarResources(a).then(r => JSON.stringify(r, null, 2)),
  create_calendar_resource: (a) => ext.createCalendarResource(a).then(r => JSON.stringify(r, null, 2)),
  get_calendar_resource: (a) => ext.getCalendarResource(a).then(r => JSON.stringify(r, null, 2)),
  update_calendar_resource: (a) => ext.updateCalendarResource(a).then(r => JSON.stringify(r, null, 2)),
  delete_calendar_resource: (a) => ext.deleteCalendarResource(a).then(r => JSON.stringify(r, null, 2)),
  get_calendar_notifications: (a) => ext.getCalendarNotifications(a).then(r => JSON.stringify(r, null, 2)),
  create_calendar_notification: (a) => ext.createCalendarNotification(a).then(r => JSON.stringify(r, null, 2)),
  get_calendar_notification: (a) => ext.getCalendarNotification(a).then(r => JSON.stringify(r, null, 2)),
  update_calendar_notification: (a) => ext.updateCalendarNotification(a).then(r => JSON.stringify(r, null, 2)),
  delete_calendar_notification: (a) => ext.deleteCalendarNotification(a).then(r => JSON.stringify(r, null, 2)),

  // Location (extended)
  get_location_by_id: (a) => ext.getLocationById(a).then(r => JSON.stringify(r, null, 2)),
  create_location: (a) => ext.createLocation(a).then(r => JSON.stringify(r, null, 2)),
  update_location: (a) => ext.updateLocation(a).then(r => JSON.stringify(r, null, 2)),
  delete_location: (a) => ext.deleteLocation(a).then(r => JSON.stringify(r, null, 2)),
  get_location_tags: (a) => ext.getLocationTags(a).then(r => JSON.stringify(r, null, 2)),
  create_location_tag: (a) => ext.createLocationTag(a).then(r => JSON.stringify(r, null, 2)),
  get_location_tag: (a) => ext.getLocationTag(a).then(r => JSON.stringify(r, null, 2)),
  update_location_tag: (a) => ext.updateLocationTag(a).then(r => JSON.stringify(r, null, 2)),
  delete_location_tag: (a) => ext.deleteLocationTag(a).then(r => JSON.stringify(r, null, 2)),
  search_location_tasks: (a) => ext.searchLocationTasks(a).then(r => JSON.stringify(r, null, 2)),
  get_location_custom_fields: (a) => ext.getLocationCustomFields(a).then(r => JSON.stringify(r, null, 2)),
  create_location_custom_field: (a) => ext.createLocationCustomField(a).then(r => JSON.stringify(r, null, 2)),
  get_location_custom_field: (a) => ext.getLocationCustomField(a).then(r => JSON.stringify(r, null, 2)),
  update_location_custom_field: (a) => ext.updateLocationCustomField(a).then(r => JSON.stringify(r, null, 2)),
  delete_location_custom_field: (a) => ext.deleteLocationCustomField(a).then(r => JSON.stringify(r, null, 2)),
  get_location_custom_values: (a) => ext.getLocationCustomValues(a).then(r => JSON.stringify(r, null, 2)),
  create_location_custom_value: (a) => ext.createLocationCustomValue(a).then(r => JSON.stringify(r, null, 2)),
  get_location_custom_value: (a) => ext.getLocationCustomValue(a).then(r => JSON.stringify(r, null, 2)),
  update_location_custom_value: (a) => ext.updateLocationCustomValue(a).then(r => JSON.stringify(r, null, 2)),
  delete_location_custom_value: (a) => ext.deleteLocationCustomValue(a).then(r => JSON.stringify(r, null, 2)),
  get_location_templates: (a) => ext.getLocationTemplates(a).then(r => JSON.stringify(r, null, 2)),
  delete_location_template: (a) => ext.deleteLocationTemplate(a).then(r => JSON.stringify(r, null, 2)),
  get_timezones: (a) => ext.getTimezones(a).then(r => JSON.stringify(r, null, 2)),

  // Blog
  get_blog_sites: (a) => ext.getBlogSites(a).then(r => JSON.stringify(r, null, 2)),
  get_blog_posts: (a) => ext.getBlogPosts(a).then(r => JSON.stringify(r, null, 2)),
  create_blog_post: (a) => ext.createBlogPost(a).then(r => JSON.stringify(r, null, 2)),
  update_blog_post: (a) => ext.updateBlogPost(a).then(r => JSON.stringify(r, null, 2)),
  get_blog_authors: (a) => ext.getBlogAuthors(a).then(r => JSON.stringify(r, null, 2)),
  get_blog_categories: (a) => ext.getBlogCategories(a).then(r => JSON.stringify(r, null, 2)),
  check_blog_url_slug: (a) => ext.checkBlogUrlSlug(a).then(r => JSON.stringify(r, null, 2)),

  // Email
  get_email_campaigns: (a) => ext.getEmailCampaigns(a).then(r => JSON.stringify(r, null, 2)),
  create_email_template: (a) => ext.createEmailTemplate(a).then(r => JSON.stringify(r, null, 2)),
  get_email_templates: (a) => ext.getEmailTemplates(a).then(r => JSON.stringify(r, null, 2)),
  update_email_template: (a) => ext.updateEmailTemplate(a).then(r => JSON.stringify(r, null, 2)),
  delete_email_template: (a) => ext.deleteEmailTemplate(a).then(r => JSON.stringify(r, null, 2)),
  verify_email: (a) => ext.verifyEmail(a).then(r => JSON.stringify(r, null, 2)),

  // Invoices
  create_invoice_template: (a) => ext.createInvoiceTemplate(a).then(r => JSON.stringify(r, null, 2)),
  list_invoice_templates: (a) => ext.listInvoiceTemplates(a).then(r => JSON.stringify(r, null, 2)),
  get_invoice_template: (a) => ext.getInvoiceTemplate(a).then(r => JSON.stringify(r, null, 2)),
  update_invoice_template: (a) => ext.updateInvoiceTemplate(a).then(r => JSON.stringify(r, null, 2)),
  delete_invoice_template: (a) => ext.deleteInvoiceTemplate(a).then(r => JSON.stringify(r, null, 2)),
  create_invoice_schedule: (a) => ext.createInvoiceSchedule(a).then(r => JSON.stringify(r, null, 2)),
  list_invoice_schedules: (a) => ext.listInvoiceSchedules(a).then(r => JSON.stringify(r, null, 2)),
  get_invoice_schedule: (a) => ext.getInvoiceSchedule(a).then(r => JSON.stringify(r, null, 2)),
  delete_invoice_schedule: (a) => ext.deleteInvoiceSchedule(a).then(r => JSON.stringify(r, null, 2)),
  cancel_invoice_schedule: (a) => ext.cancelInvoiceSchedule(a).then(r => JSON.stringify(r, null, 2)),
  generate_invoice_number: (a) => ext.generateInvoiceNumber(a).then(r => JSON.stringify(r, null, 2)),
  create_invoice: (a) => ext.createInvoice(a).then(r => JSON.stringify(r, null, 2)),
  list_invoices: (a) => ext.listInvoices(a).then(r => JSON.stringify(r, null, 2)),
  get_invoice: (a) => ext.getInvoice(a).then(r => JSON.stringify(r, null, 2)),
  update_invoice: (a) => ext.updateInvoice(a).then(r => JSON.stringify(r, null, 2)),
  delete_invoice: (a) => ext.deleteInvoice(a).then(r => JSON.stringify(r, null, 2)),
  send_invoice: (a) => ext.sendInvoice(a).then(r => JSON.stringify(r, null, 2)),
  record_invoice_payment: (a) => ext.recordInvoicePayment(a).then(r => JSON.stringify(r, null, 2)),
  void_invoice: (a) => ext.voidInvoice(a).then(r => JSON.stringify(r, null, 2)),
  text2pay_invoice: (a) => ext.text2payInvoice(a).then(r => JSON.stringify(r, null, 2)),

  // Payments
  list_orders: (a) => ext.listOrders(a).then(r => JSON.stringify(r, null, 2)),
  get_order: (a) => ext.getOrder(a).then(r => JSON.stringify(r, null, 2)),
  create_order_fulfillment: (a) => ext.createOrderFulfillment(a).then(r => JSON.stringify(r, null, 2)),
  list_order_fulfillments: (a) => ext.listOrderFulfillments(a).then(r => JSON.stringify(r, null, 2)),
  list_transactions: (a) => ext.listTransactions(a).then(r => JSON.stringify(r, null, 2)),
  get_transaction: (a) => ext.getTransaction(a).then(r => JSON.stringify(r, null, 2)),
  list_subscriptions: (a) => ext.listSubscriptions(a).then(r => JSON.stringify(r, null, 2)),
  get_subscription: (a) => ext.getSubscription(a).then(r => JSON.stringify(r, null, 2)),
  list_coupons: (a) => ext.listCoupons(a).then(r => JSON.stringify(r, null, 2)),
  get_coupon: (a) => ext.getCoupon(a).then(r => JSON.stringify(r, null, 2)),
  create_coupon: (a) => ext.createCoupon(a).then(r => JSON.stringify(r, null, 2)),
  update_coupon: (a) => ext.updateCoupon(a).then(r => JSON.stringify(r, null, 2)),
  delete_coupon: (a) => ext.deleteCoupon(a).then(r => JSON.stringify(r, null, 2)),

  // Products
  create_product: (a) => ext.createProduct(a).then(r => JSON.stringify(r, null, 2)),
  get_product: (a) => ext.getProduct(a).then(r => JSON.stringify(r, null, 2)),
  update_product: (a) => ext.updateProduct(a).then(r => JSON.stringify(r, null, 2)),
  delete_product: (a) => ext.deleteProduct(a).then(r => JSON.stringify(r, null, 2)),
  list_products: (a) => ext.listProducts(a).then(r => JSON.stringify(r, null, 2)),
  create_product_price: (a) => ext.createProductPrice(a).then(r => JSON.stringify(r, null, 2)),
  list_product_prices: (a) => ext.listProductPrices(a).then(r => JSON.stringify(r, null, 2)),
  get_product_price: (a) => ext.getProductPrice(a).then(r => JSON.stringify(r, null, 2)),
  update_product_price: (a) => ext.updateProductPrice(a).then(r => JSON.stringify(r, null, 2)),
  delete_product_price: (a) => ext.deleteProductPrice(a).then(r => JSON.stringify(r, null, 2)),
  list_inventory: (a) => ext.listInventory(a).then(r => JSON.stringify(r, null, 2)),
  create_product_collection: (a) => ext.createProductCollection(a).then(r => JSON.stringify(r, null, 2)),
  list_product_collections: (a) => ext.listProductCollections(a).then(r => JSON.stringify(r, null, 2)),
  delete_product_collection: (a) => ext.deleteProductCollection(a).then(r => JSON.stringify(r, null, 2)),
  list_product_reviews: (a) => ext.listProductReviews(a).then(r => JSON.stringify(r, null, 2)),
  update_product_review: (a) => ext.updateProductReview(a).then(r => JSON.stringify(r, null, 2)),
  delete_product_review: (a) => ext.deleteProductReview(a).then(r => JSON.stringify(r, null, 2)),

  // Social Media
  search_social_posts: (a) => ext.searchSocialPosts(a).then(r => JSON.stringify(r, null, 2)),
  create_social_post: (a) => ext.createSocialPost(a).then(r => JSON.stringify(r, null, 2)),
  get_social_post: (a) => ext.getSocialPost(a).then(r => JSON.stringify(r, null, 2)),
  update_social_post: (a) => ext.updateSocialPost(a).then(r => JSON.stringify(r, null, 2)),
  delete_social_post: (a) => ext.deleteSocialPost(a).then(r => JSON.stringify(r, null, 2)),
  bulk_delete_social_posts: (a) => ext.bulkDeleteSocialPosts(a).then(r => JSON.stringify(r, null, 2)),
  get_social_accounts: (a) => ext.getSocialAccounts(a).then(r => JSON.stringify(r, null, 2)),
  delete_social_account: (a) => ext.deleteSocialAccount(a).then(r => JSON.stringify(r, null, 2)),
  get_social_csv_upload_status: (a) => ext.getSocialCSVUploadStatus(a).then(r => JSON.stringify(r, null, 2)),
  get_social_csv_posts: (a) => ext.getSocialCSVPosts(a).then(r => JSON.stringify(r, null, 2)),
  delete_social_csv: (a) => ext.deleteSocialCSV(a).then(r => JSON.stringify(r, null, 2)),
  delete_social_csv_post: (a) => ext.deleteSocialCSVPost(a).then(r => JSON.stringify(r, null, 2)),

  // Surveys
  get_surveys: (a) => ext.getSurveys(a).then(r => JSON.stringify(r, null, 2)),
  get_survey_submissions: (a) => ext.getSurveySubmissions(a).then(r => JSON.stringify(r, null, 2)),

  // Workflows
  get_workflows: (a) => ext.getWorkflows(a).then(r => JSON.stringify(r, null, 2)),

  // Media
  get_media_files: (a) => ext.getMediaFiles(a).then(r => JSON.stringify(r, null, 2)),
  delete_media_file: (a) => ext.deleteMediaFile(a).then(r => JSON.stringify(r, null, 2)),

  // Custom Fields V2
  get_custom_field_v2_by_id: (a) => ext.getCustomFieldV2ById(a).then(r => JSON.stringify(r, null, 2)),
  create_custom_field_v2: (a) => ext.createCustomFieldV2(a).then(r => JSON.stringify(r, null, 2)),
  update_custom_field_v2: (a) => ext.updateCustomFieldV2(a).then(r => JSON.stringify(r, null, 2)),
  delete_custom_field_v2: (a) => ext.deleteCustomFieldV2(a).then(r => JSON.stringify(r, null, 2)),
  get_custom_fields_v2_by_object_key: (a) => ext.getCustomFieldsV2ByObjectKey(a).then(r => JSON.stringify(r, null, 2)),
  create_custom_field_folder: (a) => ext.createCustomFieldFolder(a).then(r => JSON.stringify(r, null, 2)),
  update_custom_field_folder: (a) => ext.updateCustomFieldFolder(a).then(r => JSON.stringify(r, null, 2)),
  delete_custom_field_folder: (a) => ext.deleteCustomFieldFolder(a).then(r => JSON.stringify(r, null, 2)),

  // Store / Shipping
  create_shipping_zone: (a) => ext.createShippingZone(a).then(r => JSON.stringify(r, null, 2)),
  list_shipping_zones: (a) => ext.listShippingZones(a).then(r => JSON.stringify(r, null, 2)),
  get_shipping_zone: (a) => ext.getShippingZone(a).then(r => JSON.stringify(r, null, 2)),
  update_shipping_zone: (a) => ext.updateShippingZone(a).then(r => JSON.stringify(r, null, 2)),
  delete_shipping_zone: (a) => ext.deleteShippingZone(a).then(r => JSON.stringify(r, null, 2)),
  create_shipping_rate: (a) => ext.createShippingRate(a).then(r => JSON.stringify(r, null, 2)),
  list_shipping_rates: (a) => ext.listShippingRates(a).then(r => JSON.stringify(r, null, 2)),
  get_shipping_rate: (a) => ext.getShippingRate(a).then(r => JSON.stringify(r, null, 2)),
  update_shipping_rate: (a) => ext.updateShippingRate(a).then(r => JSON.stringify(r, null, 2)),
  delete_shipping_rate: (a) => ext.deleteShippingRate(a).then(r => JSON.stringify(r, null, 2)),
  create_shipping_carrier: (a) => ext.createShippingCarrier(a).then(r => JSON.stringify(r, null, 2)),
  list_shipping_carriers: (a) => ext.listShippingCarriers(a).then(r => JSON.stringify(r, null, 2)),
  get_shipping_carrier: (a) => ext.getShippingCarrier(a).then(r => JSON.stringify(r, null, 2)),
  update_shipping_carrier: (a) => ext.updateShippingCarrier(a).then(r => JSON.stringify(r, null, 2)),
  delete_shipping_carrier: (a) => ext.deleteShippingCarrier(a).then(r => JSON.stringify(r, null, 2)),
  create_store_setting: (a) => ext.createStoreSetting(a).then(r => JSON.stringify(r, null, 2)),
  get_store_setting: (a) => ext.getStoreSetting(a).then(r => JSON.stringify(r, null, 2)),

  // Associations
  get_all_associations: (a) => ext.getAllAssociations(a).then(r => JSON.stringify(r, null, 2)),
  create_association: (a) => ext.createAssociation(a).then(r => JSON.stringify(r, null, 2)),
  get_association_by_id: (a) => ext.getAssociationById(a).then(r => JSON.stringify(r, null, 2)),
  get_association_by_key: (a) => ext.getAssociationByKey(a).then(r => JSON.stringify(r, null, 2)),
  get_association_by_object_key: (a) => ext.getAssociationByObjectKey(a).then(r => JSON.stringify(r, null, 2)),
  update_association: (a) => ext.updateAssociation(a).then(r => JSON.stringify(r, null, 2)),
  delete_association: (a) => ext.deleteAssociation(a).then(r => JSON.stringify(r, null, 2)),
  create_relation: (a) => ext.createRelation(a).then(r => JSON.stringify(r, null, 2)),
  get_relations_by_record: (a) => ext.getRelationsByRecord(a).then(r => JSON.stringify(r, null, 2)),
  delete_relation: (a) => ext.deleteRelation(a).then(r => JSON.stringify(r, null, 2)),

  // Objects
  get_objects_by_location: (a) => ext.getObjectsByLocation(a).then(r => JSON.stringify(r, null, 2)),
  create_object_schema: (a) => ext.createObjectSchema(a).then(r => JSON.stringify(r, null, 2)),
  get_object_schema: (a) => ext.getObjectSchema(a).then(r => JSON.stringify(r, null, 2)),
  update_object_schema: (a) => ext.updateObjectSchema(a).then(r => JSON.stringify(r, null, 2)),
  create_object_record: (a) => ext.createObjectRecord(a).then(r => JSON.stringify(r, null, 2)),
  get_object_record: (a) => ext.getObjectRecord(a).then(r => JSON.stringify(r, null, 2)),
  update_object_record: (a) => ext.updateObjectRecord(a).then(r => JSON.stringify(r, null, 2)),
  delete_object_record: (a) => ext.deleteObjectRecord(a).then(r => JSON.stringify(r, null, 2)),
  search_object_records: (a) => ext.searchObjectRecords(a).then(r => JSON.stringify(r, null, 2)),
};

// ---------------------------------------------------------------------------
// MCP server factory (one per request for stateless operation)
// ---------------------------------------------------------------------------

function createMcpServer() {
  const server = new Server(
    { name: "automate-south-mcp", version: "1.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      const result = await handler(args ?? {});
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Express HTTP server
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// CORS — required for browser-based clients like Claude.ai
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Session store
const sessions = new Map();

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "automate-south-mcp" });
});

// MCP GET — SSE stream for existing session
app.get("/mcp", async (req, res) => {
  req.headers["accept"] = "application/json, text/event-stream";
  const sessionId = req.headers["mcp-session-id"];
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(400).json({ error: "Invalid or missing session ID" });
  }
  await sessions.get(sessionId).handleRequest(req, res);
});

// MCP POST — initialize or continue session
app.post("/mcp", async (req, res) => {
  req.headers["accept"] = "application/json, text/event-stream";
  const sessionId = req.headers["mcp-session-id"];

  if (sessionId && sessions.has(sessionId)) {
    await sessions.get(sessionId).handleRequest(req, res, req.body);
    return;
  }

  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => sessions.set(id, transport),
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// MCP DELETE — close session
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId);
    sessions.delete(sessionId);
    await transport.close();
  }
  res.status(200).json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Automate South MCP server listening on port ${PORT}`);
});
