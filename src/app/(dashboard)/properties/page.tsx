export const dynamic = "force-dynamic";

import { connectDB, Listing, Reservation, InventoryMaster } from "@/lib/db";
import { format, subDays } from "date-fns";
import mongoose from "mongoose";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, TrendingUp, Calendar, DollarSign } from "lucide-react";

async function getPropertyMetrics(listingId: mongoose.Types.ObjectId) {
    const thirtyDaysAgoStr = format(subDays(new Date(), 30), "yyyy-MM-dd");

    const calendar = await InventoryMaster.find({
        listingId,
        date: { $gte: thirtyDaysAgoStr },
    }).lean();

    const bookedDays = calendar.filter((day) => day.status === "booked").length;
    const totalDays = calendar.length || 1;
    const occupancy = Math.round((bookedDays / totalDays) * 100);

    const recentReservations = await Reservation.find({
        listingId,
        checkIn: { $gte: thirtyDaysAgoStr },
    }).lean();

    const revenue = recentReservations.reduce(
        (sum, res) => sum + Number(res.totalPrice || 0),
        0
    );

    const leadTimes = recentReservations
        .map((res) => {
            const arrival = new Date(res.checkIn);
            const booked = new Date(res.createdAt);
            return Math.floor(
                (arrival.getTime() - booked.getTime()) / (1000 * 60 * 60 * 24)
            );
        })
        .filter((days) => days >= 0);

    const avgLeadTime =
        leadTimes.length > 0
            ? Math.round(
                leadTimes.reduce((sum, days) => sum + days, 0) / leadTimes.length
            )
            : 0;

    return { occupancy, revenue, avgLeadTime };
}

export default async function PropertiesPage() {
    await connectDB();

    const allListings = await Listing.find().lean();

    const listingsWithMetrics = await Promise.all(
        allListings.map(async (listing) => {
            const metrics = await getPropertyMetrics(
                listing._id as mongoose.Types.ObjectId
            );
            return { ...listing, id: listing._id.toString(), metrics };
        })
    );

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Properties</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your portfolio with AI-powered pricing intelligence
                    </p>
                </div>
                <Link href="/chat">
                    <Button size="lg">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Global Chat
                    </Button>
                </Link>
            </div>

            <div className="grid gap-4">
                {listingsWithMetrics.map((listing) => (
                    <Card key={listing.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-xl">{listing.name}</CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        {listing.area} • {listing.bedroomsNumber}BR •{" "}
                                        {listing.bathroomsNumber}BA •
                                        AED {Number(listing.price).toLocaleString("en-US")}/night
                                    </p>
                                </div>
                                <Link href={`/properties/${listing.id}/chat`}>
                                    <Button>
                                        <MessageSquare className="mr-2 h-4 w-4" />
                                        Analyze
                                    </Button>
                                </Link>
                            </div>
                        </CardHeader>

                        <CardContent>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <Calendar className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Occupancy</p>
                                        <p className="text-2xl font-bold">{listing.metrics.occupancy}%</p>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-green-100 rounded-lg">
                                        <DollarSign className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Revenue (30d)</p>
                                        <p className="text-2xl font-bold">
                                            AED {listing.metrics.revenue.toLocaleString("en-US")}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-purple-100 rounded-lg">
                                        <TrendingUp className="h-5 w-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Avg Lead Time</p>
                                        <p className="text-2xl font-bold">{listing.metrics.avgLeadTime}d</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {allListings.length === 0 && (
                <Card>
                    <CardContent className="p-12 text-center">
                        <p className="text-muted-foreground">
                            No properties found. Run the seed script to add sample data.
                        </p>
                        <pre className="mt-4 text-sm bg-muted p-4 rounded">npm run db:seed</pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
