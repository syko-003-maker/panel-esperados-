import { getSession } from "@/auth";
import { NextApiRequest, NextApiResponse } from "next";
import React from 'react';

export default async function PlaintsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const user = session?.user;

  if (!user || !user.id) {
    return <div>Vous devez être connecté pour accéder à cette page.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      {/* ...existing ticket info... */}
    </div>
  );
}