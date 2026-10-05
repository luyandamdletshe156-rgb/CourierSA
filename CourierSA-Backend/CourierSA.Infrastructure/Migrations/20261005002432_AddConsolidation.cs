using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddConsolidation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConsolidationOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    OrderNumber = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CustomerId = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    Status = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DestinationKey = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DestinationSummary = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DestinationCity = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ParcelCount = table.Column<int>(type: "int", nullable: false),
                    CombinedWeightKg = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    SeparateShippingZAR = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ConsolidatedShippingZAR = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    SavingZAR = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    MasterTrackingId = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    LengthCm = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    WidthCm = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    HeightCm = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    FinalWeightKg = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    ConsolidatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    ConsolidatedByStaffId = table.Column<Guid>(type: "char(36)", nullable: true, collation: "ascii_general_ci"),
                    Lane = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    StagedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    StagedByStaffId = table.Column<Guid>(type: "char(36)", nullable: true, collation: "ascii_general_ci"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    IsDeleted = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsolidationOrders", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "ConsolidationOrderParcels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    OrderId = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    ParcelId = table.Column<Guid>(type: "char(36)", nullable: false, collation: "ascii_general_ci"),
                    Scanned = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    ScannedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    ScannedByStaffId = table.Column<Guid>(type: "char(36)", nullable: true, collation: "ascii_general_ci"),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    IsDeleted = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsolidationOrderParcels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConsolidationOrderParcels_ConsolidationOrders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "ConsolidationOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ConsolidationOrderParcels_Parcels_ParcelId",
                        column: x => x.ParcelId,
                        principalTable: "Parcels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_ConsolidationOrderParcels_OrderId_ParcelId",
                table: "ConsolidationOrderParcels",
                columns: new[] { "OrderId", "ParcelId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsolidationOrderParcels_ParcelId",
                table: "ConsolidationOrderParcels",
                column: "ParcelId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsolidationOrders_MasterTrackingId",
                table: "ConsolidationOrders",
                column: "MasterTrackingId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsolidationOrders_OrderNumber",
                table: "ConsolidationOrders",
                column: "OrderNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsolidationOrders_Status",
                table: "ConsolidationOrders",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConsolidationOrderParcels");

            migrationBuilder.DropTable(
                name: "ConsolidationOrders");
        }
    }
}
