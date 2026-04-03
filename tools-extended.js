// ES Module — GHL extended tools (fetch-based, no axios)
const BASE = "https://services.leadconnectorhq.com";
const hdrs = (key) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json", Version: "2021-07-28" });
const loc = () => process.env.GHL_LOCATION_API_KEY || process.env.GHL_API_KEY;
const agency = () => process.env.GHL_API_KEY;

async function apiFetch(method, path, body, apiKey) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: hdrs(apiKey),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const L = { // location-key shortcuts
  get: (path) => apiFetch("GET", path, undefined, loc()),
  post: (path, body) => apiFetch("POST", path, body, loc()),
  put: (path, body) => apiFetch("PUT", path, body, loc()),
  del: (path, body) => apiFetch("DELETE", path, body, loc()),
};
const A = { // agency-key shortcuts
  get: (path) => apiFetch("GET", path, undefined, agency()),
  post: (path, body) => apiFetch("POST", path, body, agency()),
  put: (path, body) => apiFetch("PUT", path, body, agency()),
  del: (path, body) => apiFetch("DELETE", path, body, agency()),
};

// ============================================================================
// CONTACTS (extended)
// ============================================================================

export async function getContactTasks({ contactId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  const d = await L.get(`/contacts/${contactId}/tasks`);
  return d.tasks || d;
}

export async function createContactTask({ contactId, title, body, dueDate, completed = false, assignedTo } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!title) throw new Error("title is required");
  if (!dueDate) throw new Error("dueDate is required");
  const payload = { title, dueDate, completed };
  if (body) payload.body = body;
  if (assignedTo) payload.assignedTo = assignedTo;
  const d = await L.post(`/contacts/${contactId}/tasks`, payload);
  return d.task || d;
}

export async function getContactTask({ contactId, taskId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!taskId) throw new Error("taskId is required");
  const d = await L.get(`/contacts/${contactId}/tasks/${taskId}`);
  return d.task || d;
}

export async function updateContactTask({ contactId, taskId, title, body, dueDate, completed, assignedTo } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!taskId) throw new Error("taskId is required");
  const payload = {};
  if (title !== undefined) payload.title = title;
  if (body !== undefined) payload.body = body;
  if (dueDate !== undefined) payload.dueDate = dueDate;
  if (completed !== undefined) payload.completed = completed;
  if (assignedTo !== undefined) payload.assignedTo = assignedTo;
  const d = await L.put(`/contacts/${contactId}/tasks/${taskId}`, payload);
  return d.task || d;
}

export async function deleteContactTask({ contactId, taskId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!taskId) throw new Error("taskId is required");
  await L.del(`/contacts/${contactId}/tasks/${taskId}`);
  return { success: true, contactId, taskId };
}

export async function updateTaskCompletion({ contactId, taskId, completed } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!taskId) throw new Error("taskId is required");
  if (completed === undefined) throw new Error("completed is required");
  const d = await L.put(`/contacts/${contactId}/tasks/${taskId}/completed`, { completed });
  return d.task || d;
}

export async function getContactNote({ contactId, noteId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!noteId) throw new Error("noteId is required");
  const d = await L.get(`/contacts/${contactId}/notes/${noteId}`);
  return d.note || d;
}

export async function updateContactNote({ contactId, noteId, body, userId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!noteId) throw new Error("noteId is required");
  if (!body) throw new Error("body is required");
  const payload = { body };
  if (userId) payload.userId = userId;
  const d = await L.put(`/contacts/${contactId}/notes/${noteId}`, payload);
  return d.note || d;
}

export async function deleteContactNote({ contactId, noteId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!noteId) throw new Error("noteId is required");
  await L.del(`/contacts/${contactId}/notes/${noteId}`);
  return { success: true, contactId, noteId };
}

export async function upsertContact({ locationId, firstName, lastName, name, email, phone, address1, city, state, country, postalCode, website, timezone, companyName, tags, customFields } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const payload = { locationId };
  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (name) payload.name = name;
  if (email) payload.email = email;
  if (phone) payload.phone = phone;
  if (address1) payload.address1 = address1;
  if (city) payload.city = city;
  if (state) payload.state = state;
  if (country) payload.country = country;
  if (postalCode) payload.postalCode = postalCode;
  if (website) payload.website = website;
  if (timezone) payload.timezone = timezone;
  if (companyName) payload.companyName = companyName;
  if (tags) payload.tags = tags;
  if (customFields) payload.customFields = customFields;
  return L.post("/contacts/upsert", payload);
}

export async function getDuplicateContact({ locationId, email, phone } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId });
  if (email) p.set("email", email);
  if (phone) p.set("number", phone);
  const d = await L.get(`/contacts/search/duplicate?${p}`);
  return d.contact || null;
}

export async function getContactsByBusiness({ businessId, limit = 25, skip = 0, query } = {}) {
  if (!businessId) throw new Error("businessId is required");
  const p = new URLSearchParams({ limit, skip });
  if (query) p.set("query", query);
  return L.get(`/contacts/business/${businessId}?${p}`);
}

export async function getContactAppointments({ contactId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  const d = await L.get(`/contacts/${contactId}/appointments`);
  return d.events || d;
}

export async function bulkUpdateContactTags({ contactIds, tags, operation, removeAllTags } = {}) {
  if (!contactIds || !contactIds.length) throw new Error("contactIds is required");
  if (!tags || !tags.length) throw new Error("tags is required");
  if (!operation) throw new Error("operation is required (add or remove)");
  const payload = { ids: contactIds, tags, operation };
  if (removeAllTags !== undefined) payload.removeAllTags = removeAllTags;
  return L.post("/contacts/tags/bulk", payload);
}

export async function bulkUpdateContactBusiness({ contactIds, businessId } = {}) {
  if (!contactIds || !contactIds.length) throw new Error("contactIds is required");
  return L.post("/contacts/business/bulk", { ids: contactIds, businessId: businessId || null });
}

export async function addContactFollowers({ contactId, followers } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!followers || !followers.length) throw new Error("followers is required");
  return L.post(`/contacts/${contactId}/followers`, { followers });
}

export async function removeContactFollowers({ contactId, followers } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!followers || !followers.length) throw new Error("followers is required");
  await L.del(`/contacts/${contactId}/followers`, { followers });
  return { success: true, contactId, removed: followers };
}

export async function addContactToCampaign({ contactId, campaignId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!campaignId) throw new Error("campaignId is required");
  return L.post(`/contacts/${contactId}/campaigns/${campaignId}`, {});
}

export async function removeContactFromCampaign({ contactId, campaignId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!campaignId) throw new Error("campaignId is required");
  await L.del(`/contacts/${contactId}/campaigns/${campaignId}`);
  return { success: true, contactId, campaignId };
}

export async function removeContactFromAllCampaigns({ contactId } = {}) {
  if (!contactId) throw new Error("contactId is required");
  await L.del(`/contacts/${contactId}/campaigns`);
  return { success: true, contactId };
}

export async function addContactToWorkflow({ contactId, workflowId, eventStartTime } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!workflowId) throw new Error("workflowId is required");
  const payload = eventStartTime ? { eventStartTime } : {};
  return L.post(`/contacts/${contactId}/workflow/${workflowId}`, payload);
}

export async function removeContactFromWorkflow({ contactId, workflowId, eventStartTime } = {}) {
  if (!contactId) throw new Error("contactId is required");
  if (!workflowId) throw new Error("workflowId is required");
  const payload = eventStartTime ? { eventStartTime } : {};
  await L.del(`/contacts/${contactId}/workflow/${workflowId}`, payload);
  return { success: true, contactId, workflowId };
}

// ============================================================================
// CONVERSATIONS (extended)
// ============================================================================

export async function createConversation({ locationId, contactId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!contactId) throw new Error("contactId is required");
  const d = await L.post("/conversations/", { locationId, contactId });
  return d.conversation || d;
}

export async function updateConversation({ conversationId, locationId, unreadCount, starred } = {}) {
  if (!conversationId) throw new Error("conversationId is required");
  const payload = {};
  if (locationId) payload.locationId = locationId;
  if (unreadCount !== undefined) payload.unreadCount = unreadCount;
  if (starred !== undefined) payload.starred = starred;
  const d = await L.put(`/conversations/${conversationId}`, payload);
  return d.conversation || d;
}

export async function deleteConversation({ conversationId } = {}) {
  if (!conversationId) throw new Error("conversationId is required");
  await L.del(`/conversations/${conversationId}`);
  return { success: true, conversationId };
}

export async function getMessage({ messageId } = {}) {
  if (!messageId) throw new Error("messageId is required");
  return L.get(`/conversations/messages/${messageId}`);
}

export async function getEmailMessage({ emailMessageId } = {}) {
  if (!emailMessageId) throw new Error("emailMessageId is required");
  return L.get(`/conversations/messages/email/${emailMessageId}`);
}

export async function cancelScheduledEmail({ emailMessageId } = {}) {
  if (!emailMessageId) throw new Error("emailMessageId is required");
  await L.del(`/conversations/messages/email/${emailMessageId}/schedule`);
  return { success: true, emailMessageId };
}

export async function cancelScheduledMessage({ messageId } = {}) {
  if (!messageId) throw new Error("messageId is required");
  await L.del(`/conversations/messages/${messageId}/schedule`);
  return { success: true, messageId };
}

export async function addInboundMessage({ type, conversationId, contactId, message, attachments } = {}) {
  if (!type) throw new Error("type is required");
  const payload = { type };
  if (conversationId) payload.conversationId = conversationId;
  if (contactId) payload.contactId = contactId;
  if (message) payload.message = message;
  if (attachments) payload.attachments = attachments;
  return L.post("/conversations/messages/inbound", payload);
}

export async function addOutboundCall({ conversationId, contactId, userId, direction } = {}) {
  if (!conversationId && !contactId) throw new Error("conversationId or contactId is required");
  const payload = { type: "Call" };
  if (conversationId) payload.conversationId = conversationId;
  if (contactId) payload.contactId = contactId;
  if (userId) payload.userId = userId;
  if (direction) payload.direction = direction;
  return L.post("/conversations/messages/outbound", payload);
}

export async function updateMessageStatus({ messageId, status, error } = {}) {
  if (!messageId) throw new Error("messageId is required");
  if (!status) throw new Error("status is required");
  const payload = { status };
  if (error) payload.error = error;
  return L.put(`/conversations/messages/${messageId}/status`, payload);
}

export async function getMessageRecording({ messageId, locationId } = {}) {
  if (!messageId) throw new Error("messageId is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/conversations/messages/${messageId}/locations/${locationId}/recording`);
}

export async function getMessageTranscription({ messageId, locationId } = {}) {
  if (!messageId) throw new Error("messageId is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/conversations/locations/${locationId}/messages/${messageId}/transcription`);
}

export async function downloadMessageTranscription({ messageId, locationId } = {}) {
  if (!messageId) throw new Error("messageId is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/conversations/locations/${locationId}/messages/${messageId}/transcription/download`);
}

export async function liveChatTyping({ conversationId, userId, typing } = {}) {
  if (!conversationId) throw new Error("conversationId is required");
  return L.post("/conversations/providers/live-chat/typing", { conversationId, userId, typing });
}

// ============================================================================
// OPPORTUNITIES (extended)
// ============================================================================

export async function getOpportunity({ opportunityId } = {}) {
  if (!opportunityId) throw new Error("opportunityId is required");
  const d = await L.get(`/opportunities/${opportunityId}`);
  return d.opportunity || d;
}

export async function updateOpportunityStatus({ opportunityId, status } = {}) {
  if (!opportunityId) throw new Error("opportunityId is required");
  if (!status) throw new Error("status is required");
  return L.put(`/opportunities/${opportunityId}/status`, { status });
}

export async function upsertOpportunity({ locationId, pipelineId, name, pipelineStageId, status, contactId, monetaryValue, assignedTo } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!pipelineId) throw new Error("pipelineId is required");
  if (!name) throw new Error("name is required");
  const payload = { locationId, pipelineId, name };
  if (pipelineStageId) payload.pipelineStageId = pipelineStageId;
  if (status) payload.status = status;
  if (contactId) payload.contactId = contactId;
  if (monetaryValue !== undefined) payload.monetaryValue = monetaryValue;
  if (assignedTo) payload.assignedTo = assignedTo;
  return L.post("/opportunities/upsert", payload);
}

export async function addOpportunityFollowers({ opportunityId, followers } = {}) {
  if (!opportunityId) throw new Error("opportunityId is required");
  if (!followers || !followers.length) throw new Error("followers is required");
  return L.post(`/opportunities/${opportunityId}/followers`, { followers });
}

export async function removeOpportunityFollowers({ opportunityId, followers } = {}) {
  if (!opportunityId) throw new Error("opportunityId is required");
  if (!followers || !followers.length) throw new Error("followers is required");
  await L.del(`/opportunities/${opportunityId}/followers`, { followers });
  return { success: true, opportunityId, removed: followers };
}

// ============================================================================
// CALENDAR (extended)
// ============================================================================

export async function getCalendarGroups({ locationId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/calendars/groups?locationId=${encodeURIComponent(locationId)}`);
}

export async function createCalendarGroup({ locationId, name, description, slug } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  const payload = { locationId, name };
  if (description) payload.description = description;
  if (slug) payload.slug = slug;
  return L.post("/calendars/groups", payload);
}

export async function updateCalendarGroup({ groupId, name, description, slug } = {}) {
  if (!groupId) throw new Error("groupId is required");
  const payload = {};
  if (name) payload.name = name;
  if (description) payload.description = description;
  if (slug) payload.slug = slug;
  return L.put(`/calendars/groups/${groupId}`, payload);
}

export async function deleteCalendarGroup({ groupId } = {}) {
  if (!groupId) throw new Error("groupId is required");
  await L.del(`/calendars/groups/${groupId}`);
  return { success: true, groupId };
}

export async function disableCalendarGroup({ groupId, isActive } = {}) {
  if (!groupId) throw new Error("groupId is required");
  if (isActive === undefined) throw new Error("isActive is required");
  return L.post(`/calendars/groups/${groupId}/status`, { isActive });
}

export async function validateCalendarGroupSlug({ slug, locationId } = {}) {
  if (!slug) throw new Error("slug is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/calendars/groups/slug/validate?locationId=${encodeURIComponent(locationId)}&slug=${encodeURIComponent(slug)}`);
}

export async function createCalendar({ locationId, name, description, slug, calendarType, groupId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  const payload = { locationId, name };
  if (description) payload.description = description;
  if (slug) payload.slug = slug;
  if (calendarType) payload.calendarType = calendarType;
  if (groupId) payload.groupId = groupId;
  const d = await L.post("/calendars/", payload);
  return d.calendar || d;
}

export async function getCalendar({ calendarId } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  const d = await L.get(`/calendars/${calendarId}`);
  return d.calendar || d;
}

export async function updateCalendar({ calendarId, name, description, slug, calendarType, groupId } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  const payload = {};
  if (name) payload.name = name;
  if (description) payload.description = description;
  if (slug) payload.slug = slug;
  if (calendarType) payload.calendarType = calendarType;
  if (groupId) payload.groupId = groupId;
  const d = await L.put(`/calendars/${calendarId}`, payload);
  return d.calendar || d;
}

export async function deleteCalendar({ calendarId } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  await L.del(`/calendars/${calendarId}`);
  return { success: true, calendarId };
}

export async function getFreeSlots({ calendarId, startDate, endDate, timezone, userId } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  if (!startDate) throw new Error("startDate is required");
  if (!endDate) throw new Error("endDate is required");
  const p = new URLSearchParams({ startDate, endDate });
  if (timezone) p.set("timezone", timezone);
  if (userId) p.set("userId", userId);
  return L.get(`/calendars/${calendarId}/free-slots?${p}`);
}

export async function getBlockedSlots({ locationId, startTime, endTime, calendarId, userId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!startTime) throw new Error("startTime is required");
  if (!endTime) throw new Error("endTime is required");
  const p = new URLSearchParams({ locationId, startTime, endTime });
  if (calendarId) p.set("calendarId", calendarId);
  if (userId) p.set("userId", userId);
  return L.get(`/calendars/blocked-slots?${p}`);
}

export async function createAppointment({ locationId, calendarId, contactId, startTime, endTime, title, appointmentStatus, assignedUserId, address, notes, ignoreDateRange, toNotify } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!calendarId) throw new Error("calendarId is required");
  if (!contactId) throw new Error("contactId is required");
  if (!startTime) throw new Error("startTime is required");
  const payload = { locationId, calendarId, contactId, startTime };
  if (endTime) payload.endTime = endTime;
  if (title) payload.title = title;
  if (appointmentStatus) payload.appointmentStatus = appointmentStatus;
  if (assignedUserId) payload.assignedUserId = assignedUserId;
  if (address) payload.address = address;
  if (notes) payload.notes = notes;
  if (ignoreDateRange !== undefined) payload.ignoreDateRange = ignoreDateRange;
  if (toNotify !== undefined) payload.toNotify = toNotify;
  return L.post("/calendars/events/appointments", payload);
}

export async function getAppointment({ appointmentId } = {}) {
  if (!appointmentId) throw new Error("appointmentId is required");
  const d = await L.get(`/calendars/events/appointments/${appointmentId}`);
  return d.event || d;
}

export async function updateAppointment({ appointmentId, startTime, endTime, title, appointmentStatus, assignedUserId, address, notes } = {}) {
  if (!appointmentId) throw new Error("appointmentId is required");
  const payload = {};
  if (startTime) payload.startTime = startTime;
  if (endTime) payload.endTime = endTime;
  if (title) payload.title = title;
  if (appointmentStatus) payload.appointmentStatus = appointmentStatus;
  if (assignedUserId) payload.assignedUserId = assignedUserId;
  if (address) payload.address = address;
  if (notes) payload.notes = notes;
  return L.put(`/calendars/events/appointments/${appointmentId}`, payload);
}

export async function deleteAppointment({ appointmentId } = {}) {
  if (!appointmentId) throw new Error("appointmentId is required");
  await L.del(`/calendars/events/appointments/${appointmentId}`);
  return { success: true, appointmentId };
}

export async function createBlockSlot({ locationId, calendarId, startTime, endTime, title, assignedUserId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!startTime) throw new Error("startTime is required");
  if (!endTime) throw new Error("endTime is required");
  const payload = { locationId, startTime, endTime };
  if (calendarId) payload.calendarId = calendarId;
  if (title) payload.title = title;
  if (assignedUserId) payload.assignedUserId = assignedUserId;
  return L.post("/calendars/blocked-slots", payload);
}

export async function updateBlockSlot({ blockSlotId, startTime, endTime, title, calendarId, assignedUserId } = {}) {
  if (!blockSlotId) throw new Error("blockSlotId is required");
  const payload = {};
  if (startTime) payload.startTime = startTime;
  if (endTime) payload.endTime = endTime;
  if (title) payload.title = title;
  if (calendarId) payload.calendarId = calendarId;
  if (assignedUserId) payload.assignedUserId = assignedUserId;
  return L.put(`/calendars/events/block-slots/${blockSlotId}`, payload);
}

export async function getAppointmentNotes({ appointmentId, limit = 10, offset = 0 } = {}) {
  if (!appointmentId) throw new Error("appointmentId is required");
  return L.get(`/calendars/events/appointments/${appointmentId}/notes?limit=${limit}&offset=${offset}`);
}

export async function createAppointmentNote({ appointmentId, body, userId } = {}) {
  if (!appointmentId) throw new Error("appointmentId is required");
  if (!body) throw new Error("body is required");
  const payload = { body };
  if (userId) payload.userId = userId;
  return L.post(`/calendars/events/appointments/${appointmentId}/notes`, payload);
}

export async function updateAppointmentNote({ appointmentId, noteId, body, userId } = {}) {
  if (!appointmentId) throw new Error("appointmentId is required");
  if (!noteId) throw new Error("noteId is required");
  if (!body) throw new Error("body is required");
  const payload = { body };
  if (userId) payload.userId = userId;
  return L.put(`/calendars/events/appointments/${appointmentId}/notes/${noteId}`, payload);
}

export async function deleteAppointmentNote({ appointmentId, noteId } = {}) {
  if (!appointmentId) throw new Error("appointmentId is required");
  if (!noteId) throw new Error("noteId is required");
  await L.del(`/calendars/events/appointments/${appointmentId}/notes/${noteId}`);
  return { success: true, appointmentId, noteId };
}

export async function getCalendarResources({ resourceType, locationId, limit = 20, skip = 0 } = {}) {
  if (!resourceType) throw new Error("resourceType is required (equipments or rooms)");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/calendars/resources/${resourceType}?locationId=${encodeURIComponent(locationId)}&limit=${limit}&skip=${skip}`);
}

export async function createCalendarResource({ resourceType, locationId, name, description, quantity, isActive } = {}) {
  if (!resourceType) throw new Error("resourceType is required (equipments or rooms)");
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  const payload = { locationId, name };
  if (description) payload.description = description;
  if (quantity !== undefined) payload.quantity = quantity;
  if (isActive !== undefined) payload.isActive = isActive;
  return L.post(`/calendars/resources/${resourceType}`, payload);
}

export async function getCalendarResource({ resourceType, resourceId } = {}) {
  if (!resourceType) throw new Error("resourceType is required");
  if (!resourceId) throw new Error("resourceId is required");
  return L.get(`/calendars/resources/${resourceType}/${resourceId}`);
}

export async function updateCalendarResource({ resourceType, resourceId, name, description, quantity, isActive } = {}) {
  if (!resourceType) throw new Error("resourceType is required");
  if (!resourceId) throw new Error("resourceId is required");
  const payload = {};
  if (name) payload.name = name;
  if (description) payload.description = description;
  if (quantity !== undefined) payload.quantity = quantity;
  if (isActive !== undefined) payload.isActive = isActive;
  return L.put(`/calendars/resources/${resourceType}/${resourceId}`, payload);
}

export async function deleteCalendarResource({ resourceType, resourceId } = {}) {
  if (!resourceType) throw new Error("resourceType is required");
  if (!resourceId) throw new Error("resourceId is required");
  await L.del(`/calendars/resources/${resourceType}/${resourceId}`);
  return { success: true, resourceType, resourceId };
}

export async function getCalendarNotifications({ calendarId } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  return L.get(`/calendars/${calendarId}/notifications`);
}

export async function createCalendarNotification({ calendarId, type, channel, recipients, body, subject } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  if (!type) throw new Error("type is required");
  if (!channel) throw new Error("channel is required");
  const payload = { type, channel };
  if (recipients) payload.recipients = recipients;
  if (body) payload.body = body;
  if (subject) payload.subject = subject;
  return L.post(`/calendars/${calendarId}/notifications`, payload);
}

export async function getCalendarNotification({ calendarId, notificationId } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  if (!notificationId) throw new Error("notificationId is required");
  return L.get(`/calendars/${calendarId}/notifications/${notificationId}`);
}

export async function updateCalendarNotification({ calendarId, notificationId, type, channel, recipients, body, subject } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  if (!notificationId) throw new Error("notificationId is required");
  const payload = {};
  if (type) payload.type = type;
  if (channel) payload.channel = channel;
  if (recipients) payload.recipients = recipients;
  if (body) payload.body = body;
  if (subject) payload.subject = subject;
  return L.put(`/calendars/${calendarId}/notifications/${notificationId}`, payload);
}

export async function deleteCalendarNotification({ calendarId, notificationId } = {}) {
  if (!calendarId) throw new Error("calendarId is required");
  if (!notificationId) throw new Error("notificationId is required");
  await L.del(`/calendars/${calendarId}/notifications/${notificationId}`);
  return { success: true, calendarId, notificationId };
}

// ============================================================================
// LOCATION (extended)
// ============================================================================

export async function getLocationById({ locationId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/locations/${locationId}`);
}

export async function createLocation({ name, email, phone, address, city, state, country, postalCode, website, timezone, companyId } = {}) {
  if (!name) throw new Error("name is required");
  const payload = { name };
  if (email) payload.email = email;
  if (phone) payload.phone = phone;
  if (address) payload.address = address;
  if (city) payload.city = city;
  if (state) payload.state = state;
  if (country) payload.country = country;
  if (postalCode) payload.postalCode = postalCode;
  if (website) payload.website = website;
  if (timezone) payload.timezone = timezone;
  if (companyId) payload.companyId = companyId;
  return A.post("/locations/", payload);
}

export async function updateLocation({ locationId, name, email, phone, address, city, state, country, postalCode, website, timezone } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const payload = {};
  if (name) payload.name = name;
  if (email) payload.email = email;
  if (phone) payload.phone = phone;
  if (address) payload.address = address;
  if (city) payload.city = city;
  if (state) payload.state = state;
  if (country) payload.country = country;
  if (postalCode) payload.postalCode = postalCode;
  if (website) payload.website = website;
  if (timezone) payload.timezone = timezone;
  return A.put(`/locations/${locationId}`, payload);
}

export async function deleteLocation({ locationId, deleteTwilioAccount = false } = {}) {
  if (!locationId) throw new Error("locationId is required");
  await A.del(`/locations/${locationId}?deleteTwilioAccount=${deleteTwilioAccount}`);
  return { success: true, locationId };
}

export async function getLocationTags({ locationId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/locations/${locationId}/tags`);
}

export async function createLocationTag({ locationId, name } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  return L.post(`/locations/${locationId}/tags`, { name });
}

export async function getLocationTag({ locationId, tagId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!tagId) throw new Error("tagId is required");
  return L.get(`/locations/${locationId}/tags/${tagId}`);
}

export async function updateLocationTag({ locationId, tagId, name } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!tagId) throw new Error("tagId is required");
  if (!name) throw new Error("name is required");
  return L.put(`/locations/${locationId}/tags/${tagId}`, { name });
}

export async function deleteLocationTag({ locationId, tagId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!tagId) throw new Error("tagId is required");
  await L.del(`/locations/${locationId}/tags/${tagId}`);
  return { success: true, locationId, tagId };
}

export async function searchLocationTasks({ locationId, status, assignedTo, contactId, limit = 25, skip = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const payload = {};
  if (status) payload.status = status;
  if (assignedTo) payload.assignedTo = assignedTo;
  if (contactId) payload.contactId = contactId;
  if (limit) payload.limit = limit;
  if (skip) payload.skip = skip;
  return L.post(`/locations/${locationId}/tasks/search`, payload);
}

export async function getLocationCustomFields({ locationId, model } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams();
  if (model) p.set("model", model);
  return L.get(`/locations/${locationId}/customFields${p.toString() ? "?" + p : ""}`);
}

export async function createLocationCustomField({ locationId, name, fieldKey, dataType, model, placeholder, options } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  if (!fieldKey) throw new Error("fieldKey is required");
  if (!dataType) throw new Error("dataType is required");
  const payload = { name, fieldKey, dataType };
  if (model) payload.model = model;
  if (placeholder) payload.placeholder = placeholder;
  if (options) payload.options = options;
  return L.post(`/locations/${locationId}/customFields`, payload);
}

export async function getLocationCustomField({ locationId, customFieldId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!customFieldId) throw new Error("customFieldId is required");
  return L.get(`/locations/${locationId}/customFields/${customFieldId}`);
}

export async function updateLocationCustomField({ locationId, customFieldId, name, placeholder, options } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!customFieldId) throw new Error("customFieldId is required");
  const payload = {};
  if (name) payload.name = name;
  if (placeholder) payload.placeholder = placeholder;
  if (options) payload.options = options;
  return L.put(`/locations/${locationId}/customFields/${customFieldId}`, payload);
}

export async function deleteLocationCustomField({ locationId, customFieldId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!customFieldId) throw new Error("customFieldId is required");
  await L.del(`/locations/${locationId}/customFields/${customFieldId}`);
  return { success: true, locationId, customFieldId };
}

export async function getLocationCustomValues({ locationId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/locations/${locationId}/customValues`);
}

export async function createLocationCustomValue({ locationId, name, fieldKey, value } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  if (!fieldKey) throw new Error("fieldKey is required");
  const payload = { name, fieldKey };
  if (value) payload.value = value;
  return L.post(`/locations/${locationId}/customValues`, payload);
}

export async function getLocationCustomValue({ locationId, customValueId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!customValueId) throw new Error("customValueId is required");
  return L.get(`/locations/${locationId}/customValues/${customValueId}`);
}

export async function updateLocationCustomValue({ locationId, customValueId, name, value } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!customValueId) throw new Error("customValueId is required");
  const payload = {};
  if (name) payload.name = name;
  if (value) payload.value = value;
  return L.put(`/locations/${locationId}/customValues/${customValueId}`, payload);
}

export async function deleteLocationCustomValue({ locationId, customValueId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!customValueId) throw new Error("customValueId is required");
  await L.del(`/locations/${locationId}/customValues/${customValueId}`);
  return { success: true, locationId, customValueId };
}

export async function getLocationTemplates({ locationId, originId, type, deleted = false, skip = 0, limit = 25 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!originId) throw new Error("originId is required");
  const p = new URLSearchParams({ originId, deleted, skip, limit });
  if (type) p.set("type", type);
  return L.get(`/locations/${locationId}/templates?${p}`);
}

export async function deleteLocationTemplate({ locationId, templateId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!templateId) throw new Error("templateId is required");
  await L.del(`/locations/${locationId}/templates/${templateId}`);
  return { success: true, locationId, templateId };
}

export async function getTimezones({ locationId } = {}) {
  const endpoint = locationId ? `/locations/${locationId}/timezones` : "/locations/timezones";
  return L.get(endpoint);
}

// ============================================================================
// BLOG
// ============================================================================

export async function getBlogSites({ locationId, skip = 0, limit = 10, searchTerm } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, skip, limit });
  if (searchTerm) p.set("searchTerm", searchTerm);
  return L.get(`/blogs/site/all?${p}`);
}

export async function getBlogPosts({ locationId, blogId, limit = 10, offset = 0, searchTerm, status } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!blogId) throw new Error("blogId is required");
  const p = new URLSearchParams({ locationId, blogId, limit, offset });
  if (searchTerm) p.set("searchTerm", searchTerm);
  if (status) p.set("status", status);
  return L.get(`/blogs/posts/all?${p}`);
}

export async function createBlogPost({ locationId, blogId, title, rawHTML, imageUrl, imageAltText, description, author, categories, tags, publishedAt, urlSlug, status } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!blogId) throw new Error("blogId is required");
  if (!title) throw new Error("title is required");
  if (!rawHTML) throw new Error("rawHTML is required");
  const payload = { locationId, blogId, title, rawHTML };
  if (imageUrl) payload.imageUrl = imageUrl;
  if (imageAltText) payload.imageAltText = imageAltText;
  if (description) payload.description = description;
  if (author) payload.author = author;
  if (categories) payload.categories = categories;
  if (tags) payload.tags = tags;
  if (publishedAt) payload.publishedAt = publishedAt;
  if (urlSlug) payload.urlSlug = urlSlug;
  if (status) payload.status = status;
  return L.post("/blogs/posts", payload);
}

export async function updateBlogPost({ postId, locationId, title, rawHTML, imageUrl, imageAltText, description, author, categories, tags, urlSlug, status } = {}) {
  if (!postId) throw new Error("postId is required");
  if (!locationId) throw new Error("locationId is required");
  const payload = { locationId };
  if (title) payload.title = title;
  if (rawHTML) payload.rawHTML = rawHTML;
  if (imageUrl) payload.imageUrl = imageUrl;
  if (imageAltText) payload.imageAltText = imageAltText;
  if (description) payload.description = description;
  if (author) payload.author = author;
  if (categories) payload.categories = categories;
  if (tags) payload.tags = tags;
  if (urlSlug) payload.urlSlug = urlSlug;
  if (status) payload.status = status;
  return L.put(`/blogs/posts/${postId}`, payload);
}

export async function getBlogAuthors({ locationId, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/blogs/authors?locationId=${encodeURIComponent(locationId)}&limit=${limit}&offset=${offset}`);
}

export async function getBlogCategories({ locationId, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/blogs/categories?locationId=${encodeURIComponent(locationId)}&limit=${limit}&offset=${offset}`);
}

export async function checkBlogUrlSlug({ locationId, urlSlug, postId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!urlSlug) throw new Error("urlSlug is required");
  const p = new URLSearchParams({ locationId, urlSlug });
  if (postId) p.set("postId", postId);
  return L.get(`/blogs/posts/url-slug-exists?${p}`);
}

// ============================================================================
// EMAIL
// ============================================================================

export async function getEmailCampaigns({ locationId, status, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (status) p.set("status", status);
  return L.get(`/emails/schedule?${p}`);
}

export async function createEmailTemplate({ locationId, title, html, previewText, isPlainText } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!title) throw new Error("title is required");
  if (!html) throw new Error("html is required");
  const payload = { locationId, type: "html", title, html };
  if (previewText) payload.previewText = previewText;
  if (isPlainText !== undefined) payload.isPlainText = isPlainText;
  return L.post("/emails/builder", payload);
}

export async function getEmailTemplates({ locationId, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/emails/builder?locationId=${encodeURIComponent(locationId)}&limit=${limit}&offset=${offset}`);
}

export async function updateEmailTemplate({ locationId, templateId, title, html, previewText } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!templateId) throw new Error("templateId is required");
  const payload = { locationId, templateId, editorType: "html" };
  if (title) payload.title = title;
  if (html) payload.html = html;
  if (previewText) payload.previewText = previewText;
  return L.post("/emails/builder/data", payload);
}

export async function deleteEmailTemplate({ locationId, templateId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!templateId) throw new Error("templateId is required");
  await L.del(`/emails/builder/${locationId}/${templateId}`);
  return { success: true, locationId, templateId };
}

export async function verifyEmail({ locationId, type, verify } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!type) throw new Error("type is required");
  if (!verify) throw new Error("verify is required");
  return L.post(`/email/verify?locationId=${encodeURIComponent(locationId)}`, { type, verify });
}

// ============================================================================
// INVOICES
// ============================================================================

export async function createInvoiceTemplate({ altId, altType = "location", name, currency, items, businessDetails, discount, termsNotes, title } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (name) payload.name = name;
  if (currency) payload.currency = currency;
  if (items) payload.items = items;
  if (businessDetails) payload.businessDetails = businessDetails;
  if (discount) payload.discount = discount;
  if (termsNotes) payload.termsNotes = termsNotes;
  if (title) payload.title = title;
  return L.post("/invoices/template", payload);
}

export async function listInvoiceTemplates({ altId, altType = "location", status, startAt, endAt, search, limit = "10", offset = "0" } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  const p = new URLSearchParams({ altId, altType, limit, offset });
  if (status) p.set("status", status);
  if (startAt) p.set("startAt", startAt);
  if (endAt) p.set("endAt", endAt);
  if (search) p.set("search", search);
  return L.get(`/invoices/template?${p}`);
}

export async function getInvoiceTemplate({ templateId, altId, altType = "location" } = {}) {
  if (!templateId) throw new Error("templateId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  return L.get(`/invoices/template/${templateId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
}

export async function updateInvoiceTemplate({ templateId, altId, altType = "location", name, currency, items } = {}) {
  if (!templateId) throw new Error("templateId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (name) payload.name = name;
  if (currency) payload.currency = currency;
  if (items) payload.items = items;
  return L.put(`/invoices/template/${templateId}`, payload);
}

export async function deleteInvoiceTemplate({ templateId, altId, altType = "location" } = {}) {
  if (!templateId) throw new Error("templateId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  await L.del(`/invoices/template/${templateId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
  return { success: true, templateId };
}

export async function createInvoiceSchedule({ altId, altType = "location", name, currency, contactId, items, discount } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  if (!contactId) throw new Error("contactId is required");
  const payload = { altId, altType, contactId };
  if (name) payload.name = name;
  if (currency) payload.currency = currency;
  if (items) payload.items = items;
  if (discount) payload.discount = discount;
  return L.post("/invoices/schedule", payload);
}

export async function listInvoiceSchedules({ altId, altType = "location", status, limit = "10", offset = "0" } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  const p = new URLSearchParams({ altId, altType, limit, offset });
  if (status) p.set("status", status);
  return L.get(`/invoices/schedule?${p}`);
}

export async function getInvoiceSchedule({ scheduleId, altId, altType = "location" } = {}) {
  if (!scheduleId) throw new Error("scheduleId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  return L.get(`/invoices/schedule/${scheduleId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
}

export async function deleteInvoiceSchedule({ scheduleId, altId, altType = "location" } = {}) {
  if (!scheduleId) throw new Error("scheduleId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  await L.del(`/invoices/schedule/${scheduleId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
  return { success: true, scheduleId };
}

export async function cancelInvoiceSchedule({ scheduleId, altId, altType = "location" } = {}) {
  if (!scheduleId) throw new Error("scheduleId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  return L.post(`/invoices/schedule/${scheduleId}/cancel`, { altId, altType });
}

export async function generateInvoiceNumber({ altId, altType = "location" } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  return L.get(`/invoices/generate-invoice-number?altId=${encodeURIComponent(altId)}&altType=${altType}`);
}

export async function createInvoice({ altId, altType = "location", contactId, currency, items, discount, title, dueDate, termsNotes } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  if (!contactId) throw new Error("contactId is required");
  const payload = { altId, altType, contactId };
  if (currency) payload.currency = currency;
  if (items) payload.items = items;
  if (discount) payload.discount = discount;
  if (title) payload.title = title;
  if (dueDate) payload.dueDate = dueDate;
  if (termsNotes) payload.termsNotes = termsNotes;
  return L.post("/invoices/", payload);
}

export async function listInvoices({ altId, altType = "location", status, contactId, startAt, endAt, limit = "10", offset = "0" } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  const p = new URLSearchParams({ altId, altType, limit, offset });
  if (status) p.set("status", status);
  if (contactId) p.set("contactId", contactId);
  if (startAt) p.set("startAt", startAt);
  if (endAt) p.set("endAt", endAt);
  return L.get(`/invoices/?${p}`);
}

export async function getInvoice({ invoiceId, altId, altType = "location" } = {}) {
  if (!invoiceId) throw new Error("invoiceId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  return L.get(`/invoices/${invoiceId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
}

export async function updateInvoice({ invoiceId, altId, altType = "location", contactId, currency, items, discount, title, dueDate } = {}) {
  if (!invoiceId) throw new Error("invoiceId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (contactId) payload.contactId = contactId;
  if (currency) payload.currency = currency;
  if (items) payload.items = items;
  if (discount) payload.discount = discount;
  if (title) payload.title = title;
  if (dueDate) payload.dueDate = dueDate;
  return L.put(`/invoices/${invoiceId}`, payload);
}

export async function deleteInvoice({ invoiceId, altId, altType = "location" } = {}) {
  if (!invoiceId) throw new Error("invoiceId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  await L.del(`/invoices/${invoiceId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
  return { success: true, invoiceId };
}

export async function sendInvoice({ invoiceId, altId, altType = "location", action, userId } = {}) {
  if (!invoiceId) throw new Error("invoiceId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (action) payload.action = action;
  if (userId) payload.userId = userId;
  return L.post(`/invoices/${invoiceId}/send`, payload);
}

export async function recordInvoicePayment({ invoiceId, altId, altType = "location", mode, amount, notes } = {}) {
  if (!invoiceId) throw new Error("invoiceId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (mode) payload.mode = mode;
  if (amount !== undefined) payload.amount = amount;
  if (notes) payload.notes = notes;
  return L.post(`/invoices/${invoiceId}/record-payment`, payload);
}

export async function voidInvoice({ invoiceId, altId, altType = "location" } = {}) {
  if (!invoiceId) throw new Error("invoiceId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  return L.post(`/invoices/${invoiceId}/void`, { altId, altType });
}

export async function text2payInvoice({ altId, altType = "location", contactId, currency, items } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  if (!contactId) throw new Error("contactId is required");
  const payload = { altId, altType, contactId };
  if (currency) payload.currency = currency;
  if (items) payload.items = items;
  return L.post("/invoices/text2pay", payload);
}

// ============================================================================
// PAYMENTS
// ============================================================================

export async function listOrders({ locationId, status, startAt, endAt, contactId, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (status) p.set("status", status);
  if (startAt) p.set("startAt", startAt);
  if (endAt) p.set("endAt", endAt);
  if (contactId) p.set("contactId", contactId);
  return L.get(`/payments/orders?${p}`);
}

export async function getOrder({ orderId, locationId, altId, altType } = {}) {
  if (!orderId) throw new Error("orderId is required");
  const p = new URLSearchParams();
  if (locationId) p.set("locationId", locationId);
  if (altId) p.set("altId", altId);
  if (altType) p.set("altType", altType);
  return L.get(`/payments/orders/${orderId}${p.toString() ? "?" + p : ""}`);
}

export async function createOrderFulfillment({ orderId, locationId, trackingNumber, trackingUrl, items } = {}) {
  if (!orderId) throw new Error("orderId is required");
  const payload = {};
  if (locationId) payload.locationId = locationId;
  if (trackingNumber) payload.trackingNumber = trackingNumber;
  if (trackingUrl) payload.trackingUrl = trackingUrl;
  if (items) payload.items = items;
  return L.post(`/payments/orders/${orderId}/fulfillments`, payload);
}

export async function listOrderFulfillments({ orderId, locationId } = {}) {
  if (!orderId) throw new Error("orderId is required");
  const p = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  return L.get(`/payments/orders/${orderId}/fulfillments${p}`);
}

export async function listTransactions({ locationId, status, contactId, startAt, endAt, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (status) p.set("status", status);
  if (contactId) p.set("contactId", contactId);
  if (startAt) p.set("startAt", startAt);
  if (endAt) p.set("endAt", endAt);
  return L.get(`/payments/transactions?${p}`);
}

export async function getTransaction({ transactionId, locationId } = {}) {
  if (!transactionId) throw new Error("transactionId is required");
  const p = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  return L.get(`/payments/transactions/${transactionId}${p}`);
}

export async function listSubscriptions({ locationId, status, contactId, startAt, endAt, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (status) p.set("status", status);
  if (contactId) p.set("contactId", contactId);
  if (startAt) p.set("startAt", startAt);
  if (endAt) p.set("endAt", endAt);
  return L.get(`/payments/subscriptions?${p}`);
}

export async function getSubscription({ subscriptionId, locationId } = {}) {
  if (!subscriptionId) throw new Error("subscriptionId is required");
  const p = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  return L.get(`/payments/subscriptions/${subscriptionId}${p}`);
}

export async function listCoupons({ locationId, status, search, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (status) p.set("status", status);
  if (search) p.set("search", search);
  return L.get(`/payments/coupon/list?${p}`);
}

export async function getCoupon({ locationId, couponCode } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId });
  if (couponCode) p.set("couponCode", couponCode);
  return L.get(`/payments/coupon?${p}`);
}

export async function createCoupon({ locationId, name, code, discountType, discountValue, expiryDate, maxUses, productIds } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  if (!code) throw new Error("code is required");
  const payload = { locationId, name, code };
  if (discountType) payload.discountType = discountType;
  if (discountValue !== undefined) payload.discountValue = discountValue;
  if (expiryDate) payload.expiryDate = expiryDate;
  if (maxUses !== undefined) payload.maxUses = maxUses;
  if (productIds) payload.productIds = productIds;
  return L.post("/payments/coupon", payload);
}

export async function updateCoupon({ locationId, couponId, name, discountType, discountValue, expiryDate, maxUses } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!couponId) throw new Error("couponId is required");
  const payload = { locationId, couponId };
  if (name) payload.name = name;
  if (discountType) payload.discountType = discountType;
  if (discountValue !== undefined) payload.discountValue = discountValue;
  if (expiryDate) payload.expiryDate = expiryDate;
  if (maxUses !== undefined) payload.maxUses = maxUses;
  return L.put("/payments/coupon", payload);
}

export async function deleteCoupon({ locationId, couponId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!couponId) throw new Error("couponId is required");
  await L.del("/payments/coupon", { locationId, couponId });
  return { success: true, couponId };
}

// ============================================================================
// PRODUCTS
// ============================================================================

export async function createProduct({ locationId, name, description, productType, currency, image, statementDescriptor, availableInStore } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  const payload = { locationId, name };
  if (description) payload.description = description;
  if (productType) payload.productType = productType;
  if (currency) payload.currency = currency;
  if (image) payload.image = image;
  if (statementDescriptor) payload.statementDescriptor = statementDescriptor;
  if (availableInStore !== undefined) payload.availableInStore = availableInStore;
  return L.post("/products/", payload);
}

export async function getProduct({ productId, locationId } = {}) {
  if (!productId) throw new Error("productId is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/products/${productId}?locationId=${encodeURIComponent(locationId)}`);
}

export async function updateProduct({ productId, locationId, name, description, productType, currency, image, availableInStore } = {}) {
  if (!productId) throw new Error("productId is required");
  const payload = {};
  if (locationId) payload.locationId = locationId;
  if (name) payload.name = name;
  if (description) payload.description = description;
  if (productType) payload.productType = productType;
  if (currency) payload.currency = currency;
  if (image) payload.image = image;
  if (availableInStore !== undefined) payload.availableInStore = availableInStore;
  return L.put(`/products/${productId}`, payload);
}

export async function deleteProduct({ productId, locationId } = {}) {
  if (!productId) throw new Error("productId is required");
  if (!locationId) throw new Error("locationId is required");
  await L.del(`/products/${productId}?locationId=${encodeURIComponent(locationId)}`);
  return { success: true, productId };
}

export async function listProducts({ locationId, limit = 10, offset = 0, search, collectionIds, availableInStore } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (search) p.set("search", search);
  if (collectionIds) p.set("collectionIds", collectionIds);
  if (availableInStore !== undefined) p.set("availableInStore", availableInStore);
  return L.get(`/products/?${p}`);
}

export async function createProductPrice({ productId, locationId, name, amount, type, currency, billingCycle, trialDays } = {}) {
  if (!productId) throw new Error("productId is required");
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  if (amount === undefined) throw new Error("amount is required");
  const payload = { locationId, name, amount };
  if (type) payload.type = type;
  if (currency) payload.currency = currency;
  if (billingCycle) payload.billingCycle = billingCycle;
  if (trialDays !== undefined) payload.trialDays = trialDays;
  return L.post(`/products/${productId}/price`, payload);
}

export async function listProductPrices({ productId, locationId, limit = 10, offset = 0 } = {}) {
  if (!productId) throw new Error("productId is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/products/${productId}/price?locationId=${encodeURIComponent(locationId)}&limit=${limit}&offset=${offset}`);
}

export async function getProductPrice({ productId, priceId, locationId } = {}) {
  if (!productId) throw new Error("productId is required");
  if (!priceId) throw new Error("priceId is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/products/${productId}/price/${priceId}?locationId=${encodeURIComponent(locationId)}`);
}

export async function updateProductPrice({ productId, priceId, locationId, name, amount, currency } = {}) {
  if (!productId) throw new Error("productId is required");
  if (!priceId) throw new Error("priceId is required");
  const payload = {};
  if (locationId) payload.locationId = locationId;
  if (name) payload.name = name;
  if (amount !== undefined) payload.amount = amount;
  if (currency) payload.currency = currency;
  return L.put(`/products/${productId}/price/${priceId}`, payload);
}

export async function deleteProductPrice({ productId, priceId, locationId } = {}) {
  if (!productId) throw new Error("productId is required");
  if (!priceId) throw new Error("priceId is required");
  if (!locationId) throw new Error("locationId is required");
  await L.del(`/products/${productId}/price/${priceId}?locationId=${encodeURIComponent(locationId)}`);
  return { success: true, productId, priceId };
}

export async function listInventory({ locationId, productId, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (productId) p.set("productId", productId);
  return L.get(`/products/inventory?${p}`);
}

export async function createProductCollection({ locationId, name, slug, description, seoTitle, seoDescription } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  const payload = { locationId, name };
  if (slug) payload.slug = slug;
  if (description) payload.description = description;
  if (seoTitle) payload.seoTitle = seoTitle;
  if (seoDescription) payload.seoDescription = seoDescription;
  return L.post("/products/collections", payload);
}

export async function listProductCollections({ locationId, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/products/collections?locationId=${encodeURIComponent(locationId)}&limit=${limit}&offset=${offset}`);
}

export async function deleteProductCollection({ collectionId, locationId } = {}) {
  if (!collectionId) throw new Error("collectionId is required");
  if (!locationId) throw new Error("locationId is required");
  await L.del(`/products/collections/${collectionId}?locationId=${encodeURIComponent(locationId)}`);
  return { success: true, collectionId };
}

export async function listProductReviews({ locationId, productId, status, limit = 10, offset = 0 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, limit, offset });
  if (productId) p.set("productId", productId);
  if (status) p.set("status", status);
  return L.get(`/products/reviews?${p}`);
}

export async function updateProductReview({ reviewId, locationId, status, reply } = {}) {
  if (!reviewId) throw new Error("reviewId is required");
  if (!locationId) throw new Error("locationId is required");
  const payload = { locationId };
  if (status) payload.status = status;
  if (reply) payload.reply = reply;
  return L.put(`/products/reviews/${reviewId}`, payload);
}

export async function deleteProductReview({ reviewId, locationId } = {}) {
  if (!reviewId) throw new Error("reviewId is required");
  if (!locationId) throw new Error("locationId is required");
  await L.del(`/products/reviews/${reviewId}?locationId=${encodeURIComponent(locationId)}`);
  return { success: true, reviewId };
}

// ============================================================================
// SOCIAL MEDIA
// ============================================================================

export async function searchSocialPosts({ locationId, skip = 0, limit = 10, accountIds, status, startDate, endDate } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const payload = { skip, limit };
  if (accountIds) payload.accountIds = accountIds;
  if (status) payload.status = status;
  if (startDate) payload.startDate = startDate;
  if (endDate) payload.endDate = endDate;
  return L.post(`/social-media-posting/${locationId}/posts/list`, payload);
}

export async function createSocialPost({ locationId, type, accountIds, summary, scheduledAt, mediaUrls, tags, categoryIds } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!type) throw new Error("type is required");
  if (!accountIds || !accountIds.length) throw new Error("accountIds is required");
  const payload = { type, accountIds };
  if (summary) payload.summary = summary;
  if (scheduledAt) payload.scheduledAt = scheduledAt;
  if (mediaUrls) payload.mediaUrls = mediaUrls;
  if (tags) payload.tags = tags;
  if (categoryIds) payload.categoryIds = categoryIds;
  return L.post(`/social-media-posting/${locationId}/posts`, payload);
}

export async function getSocialPost({ locationId, postId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!postId) throw new Error("postId is required");
  return L.get(`/social-media-posting/${locationId}/posts/${postId}`);
}

export async function updateSocialPost({ locationId, postId, summary, scheduledAt, mediaUrls, tags, categoryIds } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!postId) throw new Error("postId is required");
  const payload = {};
  if (summary) payload.summary = summary;
  if (scheduledAt) payload.scheduledAt = scheduledAt;
  if (mediaUrls) payload.mediaUrls = mediaUrls;
  if (tags) payload.tags = tags;
  if (categoryIds) payload.categoryIds = categoryIds;
  return L.put(`/social-media-posting/${locationId}/posts/${postId}`, payload);
}

export async function deleteSocialPost({ locationId, postId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!postId) throw new Error("postId is required");
  await L.del(`/social-media-posting/${locationId}/posts/${postId}`);
  return { success: true, postId };
}

export async function bulkDeleteSocialPosts({ locationId, postIds } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!postIds || !postIds.length) throw new Error("postIds is required");
  return L.post(`/social-media-posting/${locationId}/posts/bulk-delete`, { postIds });
}

export async function getSocialAccounts({ locationId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/social-media-posting/${locationId}/accounts`);
}

export async function deleteSocialAccount({ locationId, accountId, companyId, userId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!accountId) throw new Error("accountId is required");
  const p = new URLSearchParams();
  if (companyId) p.set("companyId", companyId);
  if (userId) p.set("userId", userId);
  await L.del(`/social-media-posting/${locationId}/accounts/${accountId}${p.toString() ? "?" + p : ""}`);
  return { success: true, accountId };
}

export async function getSocialCSVUploadStatus({ locationId, skip, limit, includeUsers, userId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams();
  if (skip !== undefined) p.set("skip", skip);
  if (limit !== undefined) p.set("limit", limit);
  if (includeUsers !== undefined) p.set("includeUsers", includeUsers);
  if (userId) p.set("userId", userId);
  return L.get(`/social-media-posting/${locationId}/csv${p.toString() ? "?" + p : ""}`);
}

export async function getSocialCSVPosts({ locationId, csvId, skip, limit } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!csvId) throw new Error("csvId is required");
  const p = new URLSearchParams();
  if (skip !== undefined) p.set("skip", skip);
  if (limit !== undefined) p.set("limit", limit);
  return L.get(`/social-media-posting/${locationId}/csv/${csvId}${p.toString() ? "?" + p : ""}`);
}

export async function deleteSocialCSV({ locationId, csvId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!csvId) throw new Error("csvId is required");
  await L.del(`/social-media-posting/${locationId}/csv/${csvId}`);
  return { success: true, csvId };
}

export async function deleteSocialCSVPost({ locationId, csvId, postId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!csvId) throw new Error("csvId is required");
  if (!postId) throw new Error("postId is required");
  await L.del(`/social-media-posting/${locationId}/csv/${csvId}/post/${postId}`);
  return { success: true, csvId, postId };
}

// ============================================================================
// SURVEYS
// ============================================================================

export async function getSurveys({ locationId, skip = 0, limit = 50, type } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, skip, limit });
  if (type) p.set("type", type);
  return L.get(`/surveys/?${p}`);
}

export async function getSurveySubmissions({ locationId, surveyId, page = 1, limit = 25, q, startAt, endAt } = {}) {
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams();
  p.set("page", page.toString());
  p.set("limit", limit.toString());
  if (surveyId) p.set("surveyId", surveyId);
  if (q) p.set("q", q);
  if (startAt) p.set("startAt", startAt);
  if (endAt) p.set("endAt", endAt);
  return L.get(`/locations/${locationId}/surveys/submissions?${p}`);
}

// ============================================================================
// WORKFLOWS
// ============================================================================

export async function getWorkflows({ locationId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/workflows/?locationId=${encodeURIComponent(locationId)}`);
}

// ============================================================================
// MEDIA
// ============================================================================

export async function getMediaFiles({ altId, altType = "location", sortBy = "created_at", sortOrder = "desc", type, query, parentId, offset, limit } = {}) {
  if (!altId) throw new Error("altId is required");
  const p = new URLSearchParams({ altId, altType, sortBy, sortOrder });
  if (type) p.set("type", type);
  if (query) p.set("query", query);
  if (parentId) p.set("parentId", parentId);
  if (offset !== undefined) p.set("offset", offset);
  if (limit !== undefined) p.set("limit", limit);
  return L.get(`/medias/files?${p}`);
}

export async function deleteMediaFile({ id, altId, altType = "location" } = {}) {
  if (!id) throw new Error("id is required");
  if (!altId) throw new Error("altId is required");
  await L.del(`/medias/${id}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
  return { success: true, id };
}

// ============================================================================
// CUSTOM FIELDS V2
// ============================================================================

export async function getCustomFieldV2ById({ id } = {}) {
  if (!id) throw new Error("id is required");
  return L.get(`/custom-fields/${id}`);
}

export async function createCustomFieldV2({ locationId, dataType, fieldKey, objectKey, parentId, name, placeholder, isRequired, options } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!dataType) throw new Error("dataType is required");
  if (!fieldKey) throw new Error("fieldKey is required");
  if (!objectKey) throw new Error("objectKey is required");
  const payload = { locationId, dataType, fieldKey, objectKey };
  if (parentId) payload.parentId = parentId;
  if (name) payload.name = name;
  if (placeholder) payload.placeholder = placeholder;
  if (isRequired !== undefined) payload.isRequired = isRequired;
  if (options) payload.options = options;
  return L.post("/custom-fields/", payload);
}

export async function updateCustomFieldV2({ id, locationId, name, placeholder, options } = {}) {
  if (!id) throw new Error("id is required");
  const payload = {};
  if (locationId) payload.locationId = locationId;
  if (name) payload.name = name;
  if (placeholder) payload.placeholder = placeholder;
  if (options) payload.options = options;
  return L.put(`/custom-fields/${id}`, payload);
}

export async function deleteCustomFieldV2({ id } = {}) {
  if (!id) throw new Error("id is required");
  await L.del(`/custom-fields/${id}`);
  return { success: true, id };
}

export async function getCustomFieldsV2ByObjectKey({ objectKey, locationId } = {}) {
  if (!objectKey) throw new Error("objectKey is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/custom-fields/object-key/${objectKey}?locationId=${encodeURIComponent(locationId)}`);
}

export async function createCustomFieldFolder({ locationId, name, objectKey } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  if (!objectKey) throw new Error("objectKey is required");
  return L.post("/custom-fields/folder", { locationId, name, objectKey });
}

export async function updateCustomFieldFolder({ id, locationId, name } = {}) {
  if (!id) throw new Error("id is required");
  if (!locationId) throw new Error("locationId is required");
  if (!name) throw new Error("name is required");
  return L.put(`/custom-fields/folder/${id}`, { locationId, name });
}

export async function deleteCustomFieldFolder({ id, locationId } = {}) {
  if (!id) throw new Error("id is required");
  if (!locationId) throw new Error("locationId is required");
  await L.del(`/custom-fields/folder/${id}?locationId=${encodeURIComponent(locationId)}`);
  return { success: true, id };
}

// ============================================================================
// STORE (SHIPPING)
// ============================================================================

export async function createShippingZone({ altId, altType = "location", name, countries } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  if (!name) throw new Error("name is required");
  const payload = { altId, altType, name };
  if (countries) payload.countries = countries;
  return L.post("/store/shipping-zone", payload);
}

export async function listShippingZones({ altId, altType = "location", limit, offset, withShippingRate } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  const p = new URLSearchParams({ altId, altType });
  if (limit) p.set("limit", limit.toString());
  if (offset) p.set("offset", offset.toString());
  if (withShippingRate !== undefined) p.set("withShippingRate", withShippingRate.toString());
  return L.get(`/store/shipping-zone?${p}`);
}

export async function getShippingZone({ shippingZoneId, altId, altType = "location", withShippingRate } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const p = new URLSearchParams({ altId, altType });
  if (withShippingRate !== undefined) p.set("withShippingRate", withShippingRate.toString());
  return L.get(`/store/shipping-zone/${shippingZoneId}?${p}`);
}

export async function updateShippingZone({ shippingZoneId, altId, altType = "location", name, countries } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (name) payload.name = name;
  if (countries) payload.countries = countries;
  return L.put(`/store/shipping-zone/${shippingZoneId}`, payload);
}

export async function deleteShippingZone({ shippingZoneId, altId, altType = "location" } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  await L.del(`/store/shipping-zone/${shippingZoneId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
  return { success: true, shippingZoneId };
}

export async function createShippingRate({ shippingZoneId, altId, altType = "location", name, type, amount, minOrderAmount, maxOrderAmount } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  if (!name) throw new Error("name is required");
  const payload = { altId, altType, name };
  if (type) payload.type = type;
  if (amount !== undefined) payload.amount = amount;
  if (minOrderAmount !== undefined) payload.minOrderAmount = minOrderAmount;
  if (maxOrderAmount !== undefined) payload.maxOrderAmount = maxOrderAmount;
  return L.post(`/store/shipping-zone/${shippingZoneId}/shipping-rate`, payload);
}

export async function listShippingRates({ shippingZoneId, altId, altType = "location", limit, offset } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const p = new URLSearchParams({ altId, altType });
  if (limit) p.set("limit", limit.toString());
  if (offset) p.set("offset", offset.toString());
  return L.get(`/store/shipping-zone/${shippingZoneId}/shipping-rate?${p}`);
}

export async function getShippingRate({ shippingZoneId, shippingRateId, altId, altType = "location" } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!shippingRateId) throw new Error("shippingRateId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const p = new URLSearchParams({ altId, altType });
  return L.get(`/store/shipping-zone/${shippingZoneId}/shipping-rate/${shippingRateId}?${p}`);
}

export async function updateShippingRate({ shippingZoneId, shippingRateId, altId, altType = "location", name, type, amount } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!shippingRateId) throw new Error("shippingRateId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (name) payload.name = name;
  if (type) payload.type = type;
  if (amount !== undefined) payload.amount = amount;
  return L.put(`/store/shipping-zone/${shippingZoneId}/shipping-rate/${shippingRateId}`, payload);
}

export async function deleteShippingRate({ shippingZoneId, shippingRateId, altId, altType = "location" } = {}) {
  if (!shippingZoneId) throw new Error("shippingZoneId is required");
  if (!shippingRateId) throw new Error("shippingRateId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  await L.del(`/store/shipping-zone/${shippingZoneId}/shipping-rate/${shippingRateId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
  return { success: true, shippingZoneId, shippingRateId };
}

export async function createShippingCarrier({ altId, altType = "location", name, services } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  if (!name) throw new Error("name is required");
  const payload = { altId, altType, name };
  if (services) payload.services = services;
  return L.post("/store/shipping-carrier", payload);
}

export async function listShippingCarriers({ altId, altType = "location" } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  return L.get(`/store/shipping-carrier?altId=${encodeURIComponent(altId)}&altType=${altType}`);
}

export async function getShippingCarrier({ shippingCarrierId, altId, altType = "location" } = {}) {
  if (!shippingCarrierId) throw new Error("shippingCarrierId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  return L.get(`/store/shipping-carrier/${shippingCarrierId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
}

export async function updateShippingCarrier({ shippingCarrierId, altId, altType = "location", name, services } = {}) {
  if (!shippingCarrierId) throw new Error("shippingCarrierId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (name) payload.name = name;
  if (services) payload.services = services;
  return L.put(`/store/shipping-carrier/${shippingCarrierId}`, payload);
}

export async function deleteShippingCarrier({ shippingCarrierId, altId, altType = "location" } = {}) {
  if (!shippingCarrierId) throw new Error("shippingCarrierId is required");
  if (!altId) throw new Error("altId (locationId) is required");
  await L.del(`/store/shipping-carrier/${shippingCarrierId}?altId=${encodeURIComponent(altId)}&altType=${altType}`);
  return { success: true, shippingCarrierId };
}

export async function createStoreSetting({ altId, altType = "location", originAddress, notificationEmails } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  const payload = { altId, altType };
  if (originAddress) payload.originAddress = originAddress;
  if (notificationEmails) payload.notificationEmails = notificationEmails;
  return L.post("/store/store-setting", payload);
}

export async function getStoreSetting({ altId, altType = "location" } = {}) {
  if (!altId) throw new Error("altId (locationId) is required");
  return L.get(`/store/store-setting?altId=${encodeURIComponent(altId)}&altType=${altType}`);
}

// ============================================================================
// ASSOCIATIONS
// ============================================================================

export async function getAllAssociations({ locationId, skip = 0, limit = 25 } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/associations/?locationId=${encodeURIComponent(locationId)}&skip=${skip}&limit=${limit}`);
}

export async function createAssociation({ locationId, label, key, fromObjectKey, toObjectKey, reverse } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!label) throw new Error("label is required");
  if (!fromObjectKey) throw new Error("fromObjectKey is required");
  if (!toObjectKey) throw new Error("toObjectKey is required");
  const payload = { locationId, label, fromObjectKey, toObjectKey };
  if (key) payload.key = key;
  if (reverse) payload.reverse = reverse;
  return L.post("/associations/", payload);
}

export async function getAssociationById({ associationId } = {}) {
  if (!associationId) throw new Error("associationId is required");
  return L.get(`/associations/${associationId}`);
}

export async function getAssociationByKey({ keyName, locationId } = {}) {
  if (!keyName) throw new Error("keyName is required");
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/associations/key/${keyName}?locationId=${encodeURIComponent(locationId)}`);
}

export async function getAssociationByObjectKey({ objectKey, locationId } = {}) {
  if (!objectKey) throw new Error("objectKey is required");
  const p = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  return L.get(`/associations/objectKey/${objectKey}${p}`);
}

export async function updateAssociation({ associationId, label, reverse } = {}) {
  if (!associationId) throw new Error("associationId is required");
  const payload = {};
  if (label) payload.label = label;
  if (reverse) payload.reverse = reverse;
  return L.put(`/associations/${associationId}`, payload);
}

export async function deleteAssociation({ associationId } = {}) {
  if (!associationId) throw new Error("associationId is required");
  await L.del(`/associations/${associationId}`);
  return { success: true, associationId };
}

export async function createRelation({ locationId, associationId, firstRecordId, secondRecordId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!associationId) throw new Error("associationId is required");
  if (!firstRecordId) throw new Error("firstRecordId is required");
  if (!secondRecordId) throw new Error("secondRecordId is required");
  return L.post("/associations/relations", { locationId, associationId, firstRecordId, secondRecordId });
}

export async function getRelationsByRecord({ recordId, locationId, skip = 0, limit = 25, associationIds } = {}) {
  if (!recordId) throw new Error("recordId is required");
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId, skip: skip.toString(), limit: limit.toString() });
  if (associationIds) p.set("associationIds", associationIds);
  return L.get(`/associations/relations/${recordId}?${p}`);
}

export async function deleteRelation({ relationId, locationId } = {}) {
  if (!relationId) throw new Error("relationId is required");
  if (!locationId) throw new Error("locationId is required");
  await L.del(`/associations/relations/${relationId}?locationId=${encodeURIComponent(locationId)}`);
  return { success: true, relationId };
}

// ============================================================================
// OBJECTS (CUSTOM)
// ============================================================================

export async function getObjectsByLocation({ locationId } = {}) {
  if (!locationId) throw new Error("locationId is required");
  return L.get(`/objects/?locationId=${encodeURIComponent(locationId)}`);
}

export async function createObjectSchema({ locationId, labels, key, properties } = {}) {
  if (!locationId) throw new Error("locationId is required");
  if (!labels) throw new Error("labels is required");
  const payload = { locationId, labels };
  if (key) payload.key = key;
  if (properties) payload.properties = properties;
  return L.post("/objects/", payload);
}

export async function getObjectSchema({ key, locationId, fetchProperties } = {}) {
  if (!key) throw new Error("key is required");
  if (!locationId) throw new Error("locationId is required");
  const p = new URLSearchParams({ locationId });
  if (fetchProperties !== undefined) p.set("fetchProperties", fetchProperties.toString());
  return L.get(`/objects/${key}?${p}`);
}

export async function updateObjectSchema({ key, locationId, labels, properties } = {}) {
  if (!key) throw new Error("key is required");
  if (!locationId) throw new Error("locationId is required");
  const payload = { locationId };
  if (labels) payload.labels = labels;
  if (properties) payload.properties = properties;
  return L.put(`/objects/${key}`, payload);
}

export async function createObjectRecord({ schemaKey, locationId, properties, ownerId, followers } = {}) {
  if (!schemaKey) throw new Error("schemaKey is required");
  if (!locationId) throw new Error("locationId is required");
  const payload = { locationId };
  if (properties) payload.properties = properties;
  if (ownerId) payload.ownerId = ownerId;
  if (followers) payload.followers = followers;
  return L.post(`/objects/${schemaKey}/records`, payload);
}

export async function getObjectRecord({ schemaKey, recordId } = {}) {
  if (!schemaKey) throw new Error("schemaKey is required");
  if (!recordId) throw new Error("recordId is required");
  return L.get(`/objects/${schemaKey}/records/${recordId}`);
}

export async function updateObjectRecord({ schemaKey, recordId, locationId, properties, ownerId, followers } = {}) {
  if (!schemaKey) throw new Error("schemaKey is required");
  if (!recordId) throw new Error("recordId is required");
  if (!locationId) throw new Error("locationId is required");
  const payload = { locationId };
  if (properties) payload.properties = properties;
  if (ownerId) payload.ownerId = ownerId;
  if (followers) payload.followers = followers;
  return L.put(`/objects/${schemaKey}/records/${recordId}?locationId=${encodeURIComponent(locationId)}`, payload);
}

export async function deleteObjectRecord({ schemaKey, recordId } = {}) {
  if (!schemaKey) throw new Error("schemaKey is required");
  if (!recordId) throw new Error("recordId is required");
  await L.del(`/objects/${schemaKey}/records/${recordId}`);
  return { success: true, schemaKey, recordId };
}

export async function searchObjectRecords({ schemaKey, locationId, query, searchAfter, limit = 25 } = {}) {
  if (!schemaKey) throw new Error("schemaKey is required");
  if (!locationId) throw new Error("locationId is required");
  const payload = { locationId, limit };
  if (query) payload.query = query;
  if (searchAfter) payload.searchAfter = searchAfter;
  return L.post(`/objects/${schemaKey}/records/search`, payload);
}
