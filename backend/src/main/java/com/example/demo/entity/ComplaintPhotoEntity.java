package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "COMPLAINT_PHOTOS")
@Getter @Setter @NoArgsConstructor
public class ComplaintPhotoEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "complaint_photo_seq_gen")
    @SequenceGenerator(name = "complaint_photo_seq_gen", sequenceName = "COMPLAINT_PHOTO_SEQ", allocationSize = 1)
    @Column(name = "ID")
    private Long id;

    @Column(name = "COMPLAINT_ID", nullable = false)
    private Long complaintId;

    @Lob
    @Column(name = "DATA", nullable = false)
    private byte[] data;

    @Column(name = "MIME_TYPE", length = 50)
    private String mimeType;
}
