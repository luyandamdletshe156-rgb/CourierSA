using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSortingAssignmentReleasedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ReleasedAt",
                table: "ParcelSortingAssignments",
                type: "datetime(6)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReleasedAt",
                table: "ParcelSortingAssignments");
        }
    }
}
