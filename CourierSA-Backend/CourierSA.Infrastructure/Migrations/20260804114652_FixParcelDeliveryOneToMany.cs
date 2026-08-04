using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixParcelDeliveryOneToMany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Deliveries_Parcels_ParcelId",
                table: "Deliveries");

            migrationBuilder.DropIndex(
                name: "IX_Deliveries_ParcelId",
                table: "Deliveries");

            migrationBuilder.CreateIndex(
                name: "IX_Deliveries_ParcelId",
                table: "Deliveries",
                column: "ParcelId");

            migrationBuilder.AddForeignKey(
                name: "FK_Deliveries_Parcels_ParcelId",
                table: "Deliveries",
                column: "ParcelId",
                principalTable: "Parcels",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Deliveries_Parcels_ParcelId",
                table: "Deliveries");

            migrationBuilder.DropIndex(
                name: "IX_Deliveries_ParcelId",
                table: "Deliveries");

            migrationBuilder.CreateIndex(
                name: "IX_Deliveries_ParcelId",
                table: "Deliveries",
                column: "ParcelId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Deliveries_Parcels_ParcelId",
                table: "Deliveries",
                column: "ParcelId",
                principalTable: "Parcels",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}