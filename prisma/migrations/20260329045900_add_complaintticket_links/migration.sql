-- Add threadId field to ComplaintTicket
ALTER TABLE "ComplaintTicket" ADD COLUMN "threadId" TEXT;

-- Add complaintId field to ComplaintTicket
ALTER TABLE "ComplaintTicket" ADD COLUMN "complaintId" TEXT UNIQUE;

-- Add constraint for complaintId
ALTER TABLE "ComplaintTicket" ADD CONSTRAINT "ComplaintTicket_complaintId_fkey" 
FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE SET NULL;

-- Create index on threadId
CREATE INDEX "ComplaintTicket_threadId_idx" ON "ComplaintTicket"("threadId");

-- Create index on complaintId
CREATE INDEX "ComplaintTicket_complaintId_idx" ON "ComplaintTicket"("complaintId");
